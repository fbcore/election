const express = require('express');
const cheerio = require('cheerio');
const path = require('node:path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 1. 읍면동 검색 및 선거구 목록 파싱 API
app.post('/api/search', async (req, res) => {
  const { searchName, electionId = '0020260603' } = req.body;
  
  if (!searchName) {
    return res.status(400).json({ success: false, message: '검색할 읍면동명을 입력해주세요.' });
  }

  try {
    const response = await fetch('https://info.nec.go.kr/bizcommon/popup/popup_search_sg_emd_req.xhtml', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: `electionId=${electionId}&searchName=${encodeURIComponent(searchName)}`
    });

    if (!response.ok) {
      throw new Error(`NEC server responded with status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const emds = [];

    $('.emdName').each((i, el) => {
      const emdName = $(el).text().trim();
      const onclickAttr = $(el).parent().attr('onclick') || '';
      const match = onclickAttr.match(/fn_selectEmd\('(\d+)'\)/);
      
      if (match) {
        const emdId = match[1];
        
        // 상위 경로 파싱 (시도 > 구시군 > 읍면동)
        const pathParts = [];
        $(el).parent().parent().parent().find('p').each((j, pEl) => {
          pathParts.push($(pEl).text().trim());
        });
        const fullPath = pathParts.join(' > ');
        
        // 해당 읍면동의 선거 목록 파싱 (#ul_<emdId>)
        const ul = $(`#ul_${emdId}`);
        const elections = [];
        ul.find('li').each((j, liEl) => {
          const zoneDiv = $(liEl).find('.zone');
          if (zoneDiv.length === 0 || $(liEl).hasClass('th')) return;
          
          const type = zoneDiv.find('span').eq(0).text().trim();
          const sggLink = zoneDiv.find('a');
          if (sggLink.length === 0) return;
          
          const districtName = sggLink.text().trim();
          const countText = zoneDiv.find('span.no').text().trim();
          const count = parseInt(countText, 10) || 0;
          const memo = zoneDiv.find('span.memo').text().trim();
          
          const sgId = sggLink.attr('data-sg-id');
          const typeCode = sggLink.attr('data-sg-typecode');
          const cityCode = sggLink.attr('data-city-code');
          const sggTownCode = sggLink.attr('data-sgg-town-code');
          const sggId = sggLink.attr('data-sggid');
          
          elections.push({
            type,
            districtName,
            count,
            memo,
            sgId,
            typeCode,
            cityCode,
            sggTownCode,
            sggId
          });
        });
        
        emds.push({
          emdId,
          emdName,
          fullPath,
          elections
        });
      }
    });

    res.json({ success: true, emds });
  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).json({ success: false, message: '선거구 정보를 가져오는 중 오류가 발생했습니다.', error: error.message });
  }
});

// 2. 후보자 목록 상세 파싱 API
app.post('/api/candidates', async (req, res) => {
  const { electionId, electionCode, cityCode, townCode, sggTownCode } = req.body;

  if (!electionId || !electionCode || !cityCode) {
    return res.status(400).json({ success: false, message: '필수 선거 파라미터가 누락되었습니다.' });
  }

  try {
    const url = 'https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml';
    const params = new URLSearchParams();
    params.append('electionId', electionId);
    params.append('requestURI', `/electioninfo/${electionId}/cp/cpri03.jsp`);
    params.append('topMenuId', 'CP');
    params.append('secondMenuId', 'CPRI03');
    params.append('menuId', 'CPRI03');
    params.append('statementId', `CPRI03_#${electionCode}`);
    params.append('electionCode', electionCode.toString());
    params.append('cityCode', cityCode);

    if (electionCode === '4' || electionCode === '9' || electionCode === '10' || electionCode === '2') {
      params.append('sggCityCode', sggTownCode || '');
    } else {
      if (townCode) params.append('townCode', townCode);
      if (sggTownCode) params.append('sggTownCode', sggTownCode);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`NEC report server responded with status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const candidates = [];

    $('table tbody tr').each((i, el) => {
      const cells = $(el).find('td');
      if (cells.length === 0) return;

      // 텍스트 정제
      const getCellText = (index) => cells.eq(index).text().trim().replace(/\s+/g, ' ');

      // 이미지 분석
      const imgInput = cells.eq(1).find('input[type="image"]');
      let thumbUrl = imgInput.attr('src') || '';
      if (thumbUrl && !thumbUrl.startsWith('http')) {
        thumbUrl = 'http://cdn.nec.go.kr/' + thumbUrl;
      }
      
      const onclickAttr = imgInput.attr('onclick') || '';
      const photoMatch = onclickAttr.match(/winPhotoPopup\('([^']+)'\)/);
      let photoUrl = '';
      if (photoMatch) {
        photoUrl = 'https://cdn.nec.go.kr/' + photoMatch[1];
      } else {
        photoUrl = thumbUrl;
      }

      // 성명 및 상세 링크 파싱
      const nameLink = cells.eq(4).find('a');
      const nameText = getCellText(4);
      const nameMatch = nameText.match(/^([^\(]+)\s*(\([^\)]+\))?$/);
      const name = nameMatch ? nameMatch[1].trim() : nameText;
      const hanja = nameMatch && nameMatch[2] ? nameMatch[2].replace(/[\(\)]/g, '').trim() : '';

      let huboId = nameLink.attr('id') || '';
      if (!huboId) {
        const nameHref = nameLink.attr('href') || '';
        const huboMatch = nameHref.match(/popupHBJ\('([^']+)','([^']+)'\)/);
        huboId = huboMatch ? huboMatch[2] : '';
      }

      candidates.push({
        district: getCellText(0),
        thumbUrl,
        photoUrl,
        symbol: getCellText(2),
        party: getCellText(3),
        name,
        hanja,
        huboId,
        gender: getCellText(5),
        birthAndAge: getCellText(6),
        address: getCellText(7),
        job: getCellText(8),
        education: getCellText(9),
        career: cells.eq(10).html() ? cells.eq(10).html().trim().replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') : '',
        wealth: getCellText(11),
        military: getCellText(12),
        taxPaid: getCellText(13),
        taxOverdue5Years: getCellText(14),
        taxOverdueCurrent: getCellText(15),
        criminal: getCellText(16),
        candidaciesCount: getCellText(17)
      });
    });

    res.json({ success: true, candidates });
  } catch (error) {
    console.error('Candidates API error:', error);
    res.status(500).json({ success: false, message: '후보자 목록을 가져오는 중 오류가 발생했습니다.', error: error.message });
  }
});

// 3. 네이버 뉴스 검색 API
app.post('/api/news', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, message: '검색어가 누락되었습니다.' });
  }

  try {
    const searchUrl = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Naver search responded with status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const newsItems = [];

    $('.news_wrap').each((i, el) => {
      if (i >= 5) return; // 최대 5개 기사만 수집
      
      const titleEl = $(el).find('.news_tit');
      const title = titleEl.text().trim();
      const link = titleEl.attr('href');
      const press = $(el).find('.info_group a.info.press').text().trim().replace(/언론사 선정/g, '');
      const desc = $(el).find('.news_dsc').text().trim();

      if (title && link) {
        newsItems.push({ title, link, press, desc });
      }
    });

    res.json({ success: true, news: newsItems });
  } catch (error) {
    console.error('News API error:', error);
    res.status(500).json({ success: false, message: '뉴스 기사를 가져오는 중 오류가 발생했습니다.', error: error.message });
  }
});

// 4. 후보자 상세 PDF 링크 조회 API
app.post('/api/candidate-detail-links', async (req, res) => {
  const { electionId, huboId } = req.body;
  if (!electionId || !huboId) {
    return res.status(400).json({ success: false, message: 'electionId와 huboId가 필요합니다.' });
  }
  
  try {
    const pdfs = {};
    const gubuns = {
      education: '1',
      wealth: '2',
      tax: '3',
      military: '4',
      criminal: '5'
    };
    
    const fetchPromises = Object.entries(gubuns).map(async ([key, gubun]) => {
      const url = `https://info.nec.go.kr/electioninfo/candidate_detail_scanSearchJson.json?gubun=${gubun}&electionId=${electionId}&huboId=${huboId}&statementId=CPRI03_candidate_scanSearch`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const data = await response.json();
      const body = data.jsonResult?.body;
      if (body && body.length > 0) {
        const filePath = body[0].FILEPATH;
        if (filePath) {
          const pdfPath = filePath.replace(/\.(tif|TIF|tiff|TIFF)$/, '.PDF');
          pdfs[key] = `https://info.nec.go.kr/unielec_pdf_file/${pdfPath}`;
        }
      }
    });
    
    await Promise.all(fetchPromises);
    res.json({ success: true, pdfs });
  } catch (error) {
    console.error('PDF API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
