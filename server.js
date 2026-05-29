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
      const getCellText = (index) => {
        if (index < 0 || index >= cells.length) return '';
        return cells.eq(index).text().trim().replace(/\s+/g, ' ');
      };

      // 선거 종류별로 테이블의 총 컬럼 개수가 달라짐
      // 1. 일반 선거: 18개 컬럼
      // 2. 교육감 선거 (정당 없음, 기호 없음): 16개 컬럼
      // 3. 비례대표 등 기타 선거: 17개 컬럼
      const totalCols = cells.length;

      // 이미지 분석 (두 번째 컬럼)
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

      let name = '';
      let hanja = '';
      let huboId = '';
      let party = '무소속';

      // 각 데이터의 인덱스 매핑 설정 (컬럼 개수에 따름)
      let nameIdx, genderIdx, birthIdx, addressIdx, jobIdx, eduIdx, careerIdx, wealthIdx, milIdx, taxIdx, overdue5Idx, overdueCurIdx, crimIdx, countIdx;

      if (totalCols === 16) {
        // 교육감 선거 (정당 컬럼 없고 기호 컬럼 없음)
        party = '무소속 (교육감)';
        nameIdx = 2;
        genderIdx = 3;
        birthIdx = 4;
        addressIdx = 5;
        jobIdx = 6;
        eduIdx = 7;
        careerIdx = 8;
        wealthIdx = 9;
        milIdx = 10;
        taxIdx = 11;
        overdue5Idx = 12;
        overdueCurIdx = 13;
        crimIdx = 14;
        countIdx = 15;
      } else if (totalCols === 17) {
        // 교육의원 등 기호가 있거나 정당이 누락된 17개 컬럼 선거
        party = '무소속';
        nameIdx = 3;
        genderIdx = 4;
        birthIdx = 5;
        addressIdx = 6;
        jobIdx = 7;
        eduIdx = 8;
        careerIdx = 9;
        wealthIdx = 10;
        milIdx = 11;
        taxIdx = 12;
        overdue5Idx = 13;
        overdueCurIdx = 14;
        crimIdx = 15;
        countIdx = 16;
      } else {
        // 일반 선거 (18개 컬럼)
        party = getCellText(3);
        nameIdx = 4;
        genderIdx = 5;
        birthIdx = 6;
        addressIdx = 7;
        jobIdx = 8;
        eduIdx = 9;
        careerIdx = 10;
        wealthIdx = 11;
        milIdx = 12;
        taxIdx = 13;
        overdue5Idx = 14;
        overdueCurIdx = 15;
        crimIdx = 16;
        countIdx = 17;
      }

      // 성명 파싱
      const nameLink = cells.eq(nameIdx).find('a');
      const nameText = getCellText(nameIdx);
      const nameMatch = nameText.match(/^([^\(]+)\s*(\([^\)]+\))?$/);
      name = nameMatch ? nameMatch[1].trim() : nameText;
      hanja = nameMatch && nameMatch[2] ? nameMatch[2].replace(/[\(\)]/g, '').trim() : '';

      huboId = nameLink.attr('id') || '';
      if (!huboId) {
        const nameHref = nameLink.attr('href') || '';
        const huboMatch = nameHref.match(/popupHBJ\('([^']+)','([^']+)'\)/);
        huboId = huboMatch ? huboMatch[2] : '';
      }

      // 기호(symbol) 설정
      // 교육감선거(16개)는 기호가 없으므로 공백 또는 "순환" 처리
      const symbol = totalCols === 16 ? '-' : getCellText(2);

      candidates.push({
        district: getCellText(0),
        thumbUrl,
        photoUrl,
        symbol,
        party,
        name,
        hanja,
        huboId,
        gender: getCellText(genderIdx),
        birthAndAge: getCellText(birthIdx),
        address: getCellText(addressIdx),
        job: getCellText(jobIdx),
        education: getCellText(eduIdx),
        career: cells.eq(careerIdx).html() ? cells.eq(careerIdx).html().trim().replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') : '',
        wealth: getCellText(wealthIdx),
        military: getCellText(milIdx),
        taxPaid: getCellText(taxIdx),
        taxOverdue5Years: getCellText(overdue5Idx),
        taxOverdueCurrent: getCellText(overdueCurIdx),
        criminal: getCellText(crimIdx),
        candidaciesCount: getCellText(countIdx)
      });
    });

    res.json({ success: true, candidates });
  } catch (error) {
    console.error('Candidates API error:', error);
    res.status(500).json({ success: false, message: '후보자 목록을 가져오는 중 오류가 발생했습니다.', error: error.message });
  }
});

// 3. 구글 뉴스 RSS 검색 API (봇 탐지 차단 방지)
app.post('/api/news', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ success: false, message: '검색어가 누락되었습니다.' });
  }

  try {
    // 구글 뉴스 RSS API 호출
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Google News RSS responded with status: ${response.status}`);
    }

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true }); // XML 파싱 모드 활성화
    const newsItems = [];

    $('item').each((i, el) => {
      if (i >= 5) return; // 최대 5개 기사만 제한
      
      const rawTitle = $(el).find('title').text().trim();
      const link = $(el).find('link').text().trim();
      const press = $(el).find('source').text().trim() || '언론사';
      
      // 구글 뉴스 타이틀은 보통 "기사 제목 - 언론사명" 형태이므로 뒷부분의 언론사명 분리 정리
      let title = rawTitle;
      const dashIdx = rawTitle.lastIndexOf(' - ');
      if (dashIdx !== -1) {
        title = rawTitle.substring(0, dashIdx).trim();
      }

      // RSS의 description 내의 HTML 태그 정제하여 요약 텍스트 추출
      const rawDesc = $(el).find('description').text().trim();
      const desc = rawDesc.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

      if (title && link) {
        newsItems.push({ title, link, press, desc });
      }
    });

    res.json({ success: true, news: newsItems });
  } catch (error) {
    console.error('Google News RSS API error:', error);
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
