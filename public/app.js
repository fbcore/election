document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const loader = document.getElementById('loader');
  const errorMessage = document.getElementById('error-message');
  
  const emdSection = document.getElementById('emd-selection-section');
  const emdList = document.getElementById('emd-list');
  
  const electionSection = document.getElementById('election-list-section');
  const selectedEmdPath = document.getElementById('selected-emd-path');
  const electionGrid = document.getElementById('election-grid');
  
  const candidatesSection = document.getElementById('candidates-section');
  const selectedElectionTitle = document.getElementById('selected-election-title');
  const selectedDistrictName = document.getElementById('selected-district-name');
  const selectedElectionQuota = document.getElementById('selected-election-quota');
  const candidatesGrid = document.getElementById('candidates-grid');
  const closeCandidatesBtn = document.getElementById('close-candidates-btn');

  let currentEmdData = null;
  let isAutoFilled = false; // 자동 기입 상태 플래그

  // 브라우저 위치 정보 기반으로 행정동명 자동 입력
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // 무료 역지오코딩 API 호출 (BigDataCloud - 무인증 키 제공)
        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=ko`);
        const geoData = await response.json();
        
        // 동명 추출 (예: "역삼1동" 또는 "역삼동" 등)
        let dongName = '';
        if (geoData.locality) {
          // 행정동 단위 추출을 위해 locality 또는 영도구 남항동처럼 마지막 단어가 '동/읍/면'으로 끝나는 값 파싱
          const tokens = geoData.locality.split(' ');
          dongName = tokens.find(t => t.endsWith('동') || t.endsWith('읍') || t.endsWith('면')) || geoData.locality;
        }

        if (dongName) {
          searchInput.value = dongName;
          isAutoFilled = true; // 자동 기입됨을 표시
        }
      } catch (err) {
        console.warn('Geolocation reverse-geocode failed:', err);
      }
    }, (err) => {
      console.warn('Geolocation position access denied or error:', err);
    });
  }

  // 사용자가 입력 필드 클릭(포커스) 시 자동 입력된 값 지우기
  searchInput.addEventListener('focus', () => {
    if (isAutoFilled) {
      searchInput.value = '';
      isAutoFilled = false; // 플래그 초기화
    }
  });

  // 사용자가 타이핑하면 자동 기입 플래그 해제
  searchInput.addEventListener('input', () => {
    isAutoFilled = false;
  });

  // 1. 주소(읍면동) 검색 제출
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    // UI 초기화
    hideElements([emdSection, electionSection, candidatesSection, errorMessage]);
    showElements([loader]);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchName: query })
      });
      const data = await res.json();

      hideElements([loader]);

      if (data.success && data.emds.length > 0) {
        // 검색 완료 후 검색창 섹션을 화면에서 숨김
        const searchSection = document.querySelector('.search-section');
        if (searchSection) searchSection.classList.add('hide');

        renderEmdList(data.emds);
        showElements([emdSection]);
      } else {
        showError('검색된 지역 정보가 없습니다. 지번/행정동명을 정확히 입력해주세요.');
      }
    } catch (err) {
      console.error(err);
      hideElements([loader]);
      showError('서버 연결 중 오류가 발생했습니다.');
    }
  });

  // 2. 행정동 카드 렌더링
  function renderEmdList(emds) {
    emdList.innerHTML = '';
    emds.forEach(emd => {
      const card = document.createElement('div');
      card.className = 'emd-card card';
      card.innerHTML = `
        <h3>${emd.emdName}</h3>
        <p class="path"><i class="fa-solid fa-location-dot"></i> ${emd.fullPath}</p>
      `;
      card.addEventListener('click', () => {
        selectEmd(emd);
      });
      emdList.appendChild(card);
    });
  }

  // 3. 행정동 선택 시 선거 목록 표시
  function selectEmd(emd) {
    currentEmdData = emd;
    selectedEmdPath.textContent = emd.fullPath;
    
    // UI 전환
    hideElements([emdSection, candidatesSection, errorMessage]);
    renderElectionList(emd.elections);
    showElements([electionSection]);
    
    // 스크롤 이동
    electionSection.scrollIntoView({ behavior: 'smooth' });
  }

  // 4. 선거 목록 렌더링
  function renderElectionList(elections) {
    electionGrid.innerHTML = '';
    elections.forEach(elec => {
      const card = document.createElement('div');
      card.className = 'election-card card';
      card.innerHTML = `
        <div class="election-card-header">
          <span class="quota-pill">정수: ${elec.count}명</span>
        </div>
        <div class="election-card-body">
          <h3>${elec.type}</h3>
          <span class="election-district-sub">${elec.districtName}</span>
        </div>
        <div class="election-card-footer">
          <span>${elec.memo ? `<i class="fa-solid fa-circle-info"></i> ${elec.memo}` : ''}</span>
          <span class="arrow">후보자 보기 <i class="fa-solid fa-arrow-right"></i></span>
        </div>
      `;
      card.addEventListener('click', () => {
        loadCandidates(elec);
      });
      electionGrid.appendChild(card);
    });
  }

  // 5. 후보자 정보 로드
  async function loadCandidates(election) {
    hideElements([errorMessage]);
    showElements([loader]);

    try {
      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          electionId: election.sgId,
          electionCode: election.typeCode,
          cityCode: election.cityCode,
          townCode: election.sggId,
          sggTownCode: election.sggTownCode
        })
      });
      const data = await res.json();
      
      hideElements([loader]);

      if (data.success && data.candidates.length > 0) {
        selectedElectionTitle.textContent = `${election.type} 후보자`;
        selectedDistrictName.textContent = election.districtName;
        selectedElectionQuota.textContent = `선출 정수: ${election.count}명`;
        
        renderCandidates(data.candidates, election);
        hideElements([electionSection]);
        showElements([candidatesSection]);
        candidatesSection.scrollIntoView({ behavior: 'smooth' });
      } else {
        showError('해당 선거구에 등록된 후보자 목록이 없습니다.');
      }
    } catch (err) {
      console.error(err);
      hideElements([loader]);
      showError('후보자 정보를 가져오는 중 오류가 발생했습니다.');
    }
  }

  // 6. 후보자 목록 렌더링
  function renderCandidates(candidates, election) {
    candidatesGrid.innerHTML = '';
    
    // 무투표 당선 감지 (선출 정수보다 후보자가 같거나 적은 경우)
    const isUncontested = candidates.length <= election.count;
    if (isUncontested) {
      const banner = document.createElement('div');
      banner.className = 'uncontested-banner';
      banner.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>이 선거구는 후보자 수(<strong>${candidates.length}명</strong>)가 선출 정수(<strong>${election.count}명</strong>)와 같거나 적어, 투표를 실시하지 않는 <strong>'무투표 당선'</strong> 선거구입니다.</span>
      `;
      candidatesGrid.appendChild(banner);
    }
    
    candidates.forEach(c => {
      const card = document.createElement('div');
      card.className = 'candidate-card card';
      
      // 당과 관련된 CSS 클래스 얻기
      const partyClass = getPartyClass(c.party);

      // 전과 및 체납 강조 표시
      const criminalClass = c.criminal !== '없음' ? 'danger-highlight' : '';
      
      // 체납 정보의 포맷 정규화 및 체납 유무 판별 (0, '', '없음' 외의 실질적 값 확인)
      const hasTaxOverdue5 = c.taxOverdue5Years && c.taxOverdue5Years !== '0' && c.taxOverdue5Years !== '없음' && c.taxOverdue5Years !== '';
      const hasTaxOverdueCur = c.taxOverdueCurrent && c.taxOverdueCurrent !== '0' && c.taxOverdueCurrent !== '없음' && c.taxOverdueCurrent !== '';
      
      // 체납 심각도 클래스 매핑 (현재 체납 진행 중일 때 danger-highlight 적용, 단순 과거 이력은 warning-highlight 적용)
      const taxOverdueClass = hasTaxOverdueCur ? 'danger-highlight' : (hasTaxOverdue5 ? 'warning-highlight' : '');

      // 재산 배율 및 그래프 계산 (국민 평균 순자산: 4억 7,144만 원 = 471,440천원)
      const candidateWealth = parseInt(c.wealth.replace(/,/g, ''), 10) || 0;
      const avgWealth = 471440;
      const ratio = (candidateWealth / avgWealth).toFixed(1);

      // --- 동적 선형 비례 스케일 기반 게이지 너비 계산 ---
      // 1. 해당 선거구 후보자 전체 목록 중 최대 재산액(양수 기준)을 구합니다.
      const wealthValues = candidates.map(cand => parseInt(cand.wealth.replace(/,/g, ''), 10) || 0);
      const maxWealth = Math.max(...wealthValues, avgWealth); // 최소 평균값(4.71억) 이상을 기준으로 설정하여 극소 자산선거구에서도 형태 보장

      let barWidth = 0;
      if (candidateWealth > 0) {
        // 최대 재산 대비 비례 비율(%)을 구합니다.
        barWidth = Math.max(5, Math.min((candidateWealth / maxWealth) * 100, 100));
      } else {
        // 마이너스 재산 또는 0원 이하는 3%의 최소 게이지 폭만 확보
        barWidth = 3;
      }

      // 2. 최대 재산 대비 국민 평균(4.71억)의 비율 위치로 평균 마커를 동적 세팅합니다.
      const averageMarkerPercent = Math.max(5, Math.min((avgWealth / maxWealth) * 100, 95));

      card.innerHTML = `
        <div class="candidate-card-content">
          <div class="candidate-photo-wrapper">
            <span class="candidate-symbol-tag">${c.symbol}</span>
            <img src="${c.thumbUrl || 'https://via.placeholder.com/150x200?text=No+Image'}" alt="${c.name}" class="candidate-photo" onerror="this.src='https://via.placeholder.com/150x200?text=No+Image'">
          </div>
          <div class="candidate-details">
            <div class="candidate-header">
              <div class="candidate-header-left">
                <h3>${c.name} <span class="candidate-hanja">${c.hanja ? `(${c.hanja})` : ''}</span></h3>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 5px; flex-wrap: wrap;">
                  <span class="candidate-party-label ${partyClass}">${c.party}</span>
                  ${isUncontested ? `<span class="badge badge-uncontested">무투표 당선 예정</span>` : ''}
                  ${c.criminal !== '없음' ? `<span class="badge badge-danger" title="${c.criminal}"><i class="fa-solid fa-triangle-exclamation"></i> 전과 ${c.criminal}</span>` : ''}
                  ${hasTaxOverdueCur ? `<span class="badge badge-danger" title="현재 체납액: ${c.taxOverdueCurrent}천원"><i class="fa-solid fa-receipt"></i> 현재 세금 체납 (${formatTax(c.taxOverdueCurrent)})</span>` : ''}
                  ${hasTaxOverdue5 ? `<span class="badge badge-warning" title="최근 5년간 체납액: ${c.taxOverdue5Years}천원"><i class="fa-solid fa-clock-rotate-left"></i> 최근 5년간 체납 이력 (${formatTax(c.taxOverdue5Years)})</span>` : ''}
                </div>
              </div>
              <a href="https://info.nec.go.kr/electioninfo/candidate_detail_info.xhtml?electionId=${election.sgId}&huboId=${c.huboId}" target="_blank" class="official-info-btn">
                <i class="fa-solid fa-address-card"></i> 선관위 상세정보
              </a>
            </div>
            
            <div class="candidate-info-grid">
              <div class="info-item">
                <span class="label">생년월일</span>
                <span class="val">${c.birthAndAge}</span>
              </div>
              <div class="info-item">
                <span class="label">직업/학력</span>
                <span class="val">${c.job} / ${c.education}</span>
              </div>
              
              <!-- 재산 배율 및 시각 그래프 -->
              <div class="info-item wealth-item" style="grid-column: span 2;">
                <span class="label">재산 신고액</span>
                <div class="wealth-info-wrapper">
                  <span class="val">${formatWealth(c.wealth)}</span>
                  <div class="wealth-graph-container">
                    <div class="wealth-bar-container">
                      <div class="wealth-bar-fill" style="width: ${barWidth}%;"></div>
                      <div class="wealth-average-marker" style="left: ${averageMarkerPercent}%;" title="국민 평균 순자산 (4.71억원)"></div>
                    </div>
                    <span class="wealth-ratio-label">국민 평균 순자산(4.71억원)의 <strong class="${parseFloat(ratio) >= 1 ? 'warning-highlight' : 'cyan-highlight'}">${ratio}배</strong></span>
                  </div>
                </div>
              </div>
              
              <div class="info-item">
                <span class="label">병역 사항</span>
                <span class="val">${c.military}</span>
              </div>
              <div class="info-item" style="grid-column: span 2;">
                <span class="label">세금 납부</span>
                <span class="val ${taxOverdueClass}">
                  납부: ${formatTax(c.taxPaid)} 
                  ${(hasTaxOverdueCur || hasTaxOverdue5) ? `(
                    ${hasTaxOverdueCur ? `현재 체납: ${formatTax(c.taxOverdueCurrent)}` : ''}
                    ${hasTaxOverdueCur && hasTaxOverdue5 ? ', ' : ''}
                    ${hasTaxOverdue5 ? `최근 5년간 체납: ${formatTax(c.taxOverdue5Years)}` : ''}
                  )` : '(체납 없음)'}
                </span>
              </div>
              <div class="info-item" style="grid-column: span 2;">
                <span class="label">전과 기록</span>
                <span class="val ${criminalClass}">${c.criminal}</span>
              </div>
              <div class="info-item" style="grid-column: span 2;">
                <span class="label">주요 경력</span>
                <span class="val">${c.career || '기록 없음'}</span>
              </div>
              
              <!-- 상세 PDF 연동 링크 영역 -->
              <div class="info-item pdf-item" style="grid-column: span 2;">
                <span class="label">상세 서류</span>
                <div class="pdf-links-container" id="pdfs-${c.huboId}">
                  <span class="pdf-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> 상세 PDF 불러오는 중...</span>
                </div>
              </div>
            </div>
            
            <div class="candidate-actions">
              <button class="btn-toggle-news" data-name="${c.name}">
                <i class="fa-solid fa-newspaper"></i> 관련 뉴스/기사 조회
              </button>
            </div>
            
            <div class="news-accordion" id="news-${c.name.replace(/\s+/g, '')}">
              <div class="loader-wrapper hide"><div class="spinner" style="width: 30px; height: 30px;"></div></div>
              <div class="news-list"></div>
            </div>
          </div>
        </div>
      `;

      // 뉴스 조회 이벤트 바인딩
      const newsBtn = card.querySelector('.btn-toggle-news');
      const newsAccordion = card.querySelector('.news-accordion');
      
      newsBtn.addEventListener('click', () => {
        toggleNews(newsBtn, newsAccordion, c.name, election.districtName);
      });

      // 비동기 PDF 상세 서류 링크 로드
      (async () => {
        try {
          const res = await fetch('/api/candidate-detail-links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ electionId: election.sgId, huboId: c.huboId })
          });
          const data = await res.json();
          const pdfContainer = card.querySelector(`#pdfs-${c.huboId}`);
          
          if (data.success && data.pdfs) {
            pdfContainer.innerHTML = '';
            const links = [];
            if (data.pdfs.criminal) links.push(`<a href="${data.pdfs.criminal}" target="_blank" class="btn-pdf"><i class="fa-solid fa-file-pdf"></i> 전과상세</a>`);
            if (data.pdfs.wealth) links.push(`<a href="${data.pdfs.wealth}" target="_blank" class="btn-pdf"><i class="fa-solid fa-file-pdf"></i> 재산상세</a>`);
            if (data.pdfs.military) links.push(`<a href="${data.pdfs.military}" target="_blank" class="btn-pdf"><i class="fa-solid fa-file-pdf"></i> 병역상세</a>`);
            if (data.pdfs.tax) links.push(`<a href="${data.pdfs.tax}" target="_blank" class="btn-pdf"><i class="fa-solid fa-file-pdf"></i> 납세상세</a>`);
            if (data.pdfs.education) links.push(`<a href="${data.pdfs.education}" target="_blank" class="btn-pdf"><i class="fa-solid fa-file-pdf"></i> 학력상세</a>`);
            
            if (links.length > 0) {
              pdfContainer.innerHTML = links.join('');
            } else {
              pdfContainer.innerHTML = '<span class="pdf-empty">제공되는 상세 서류 PDF가 없습니다.</span>';
            }
          } else {
            pdfContainer.innerHTML = '<span class="pdf-empty">상세 서류 조회가 지원되지 않습니다.</span>';
          }
        } catch (err) {
          console.error('PDF fetch error:', err);
          card.querySelector(`#pdfs-${c.huboId}`).innerHTML = '<span class="pdf-empty">PDF 로드 실패</span>';
        }
      })();

      candidatesGrid.appendChild(card);
    });
  }

  // 7. 뉴스 아코디언 토글 및 기사 로드
  async function toggleNews(btn, accordion, name, districtName) {
    const isOpen = accordion.classList.contains('open');
    
    if (isOpen) {
      accordion.classList.remove('open');
      btn.innerHTML = `<i class="fa-solid fa-newspaper"></i> 관련 뉴스/기사 조회`;
      return;
    }

    accordion.classList.add('open');
    btn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> 뉴스 닫기`;

    const newsListContainer = accordion.querySelector('.news-list');
    const newsSpinner = accordion.querySelector('.loader-wrapper');

    // 이미 조회한 기사가 있으면 다시 요청하지 않음
    if (newsListContainer.children.length > 0) return;

    showElements([newsSpinner]);
    newsListContainer.innerHTML = '';

    try {
      // 쿼리: 지방선거 + 구시군명 + 후보자명
      const pathParts = currentEmdData ? currentEmdData.fullPath.split(' > ') : [];
      const guName = pathParts[1] || '';
      const searchQuery = `지방선거 ${guName} ${name}`.trim();
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      const data = await res.json();
      
      hideElements([newsSpinner]);

      if (data.success && data.news.length > 0) {
        data.news.forEach(article => {
          const item = document.createElement('div');
          item.className = 'news-item';
          item.innerHTML = `
            <div class="news-header">
              <a href="${article.link}" target="_blank" class="news-title">${article.title}</a>
              <span class="news-press">${article.press || '언론사'}</span>
            </div>
            <p class="news-desc">${article.desc}</p>
          `;
          newsListContainer.appendChild(item);
        });
      } else {
        newsListContainer.innerHTML = `<p class="news-empty"><i class="fa-solid fa-info-circle"></i> 검색된 최근 관련 기사가 없습니다.</p>`;
      }
    } catch (err) {
      console.error(err);
      hideElements([newsSpinner]);
      newsListContainer.innerHTML = `<p class="news-empty"><i class="fa-solid fa-circle-exclamation text-danger"></i> 뉴스 검색에 실패했습니다.</p>`;
    }
  }

  // 8. 선거구 목록으로 돌아가기 버튼
  closeCandidatesBtn.addEventListener('click', () => {
    hideElements([candidatesSection]);
    showElements([electionSection]);
    electionSection.scrollIntoView({ behavior: 'smooth' });
  });

  // 헬퍼 함수들
  function hideElements(elements) {
    elements.forEach(el => {
      if (el) el.classList.add('hide');
    });
  }

  function showElements(elements) {
    elements.forEach(el => {
      if (el) el.classList.remove('hide');
    });
  }

  function showError(msg) {
    errorMessage.querySelector('.message-text').textContent = msg;
    showElements([errorMessage]);
  }

  function getPartyClass(partyName) {
    if (partyName.includes('더불어민주당')) return 'party-minjoo';
    if (partyName.includes('국민의힘')) return 'party-gukmin';
    if (partyName.includes('개혁신당')) return 'party-reform';
    if (partyName.includes('진보당')) return 'party-progressive';
    if (partyName.includes('정의당') || partyName.includes('녹색정의당')) return 'party-greenjustice';
    return 'party-etc';
  }

  function formatWealth(wealthStr) {
    const val = parseInt(wealthStr.replace(/,/g, ''), 10); // 천원 단위 수치
    if (isNaN(val)) return wealthStr;
    
    // 마이너스 재산 처리
    const isNegative = val < 0;
    const absVal = Math.abs(val);
    
    const eok = absVal / 100000; // 1억원 = 100,000천원
    const formatted = `${isNegative ? '-' : ''}${eok.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}억원`;
    return formatted;
  }

  function formatTax(taxStr) {
    if (!taxStr) return '0천원';
    const val = parseInt(taxStr.replace(/,/g, ''), 10);
    if (isNaN(val)) return taxStr; // 숫자가 아닌 원본 텍스트는 그대로 유지
    return `${val.toLocaleString('ko-KR')}천원`;
  }
});
