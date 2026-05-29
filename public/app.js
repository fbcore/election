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
          <span class="election-type-badge">${elec.type}</span>
          <span class="quota-pill">정수: ${elec.count}명</span>
        </div>
        <div class="election-card-body">
          <h3>${elec.districtName}</h3>
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
    
    candidates.forEach(c => {
      const card = document.createElement('div');
      card.className = 'candidate-card card';
      
      // 당과 관련된 CSS 클래스 얻기
      const partyClass = getPartyClass(c.party);

      // 전과 및 체납 강조 표시
      const criminalClass = c.criminal !== '없음' ? 'danger-highlight' : '';
      const taxOverdueClass = (c.taxOverdue5Years !== '0' || c.taxOverdueCurrent !== '0') ? 'warning-highlight' : '';

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
                <p class="candidate-party-label ${partyClass}">${c.party}</p>
              </div>
              <a href="https://info.nec.go.kr/electioninfo/candidate_detail_info.xhtml?electionId=${election.sgId}&huboId=${c.huboId}" target="_blank" class="official-info-btn">
                <i class="fa-solid fa-address-card"></i> 선관위 상세 정보
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
              <div class="info-item">
                <span class="label">재산 신고액</span>
                <span class="val">${formatWealth(c.wealth)}</span>
              </div>
              <div class="info-item">
                <span class="label">병역 사항</span>
                <span class="val">${c.military}</span>
              </div>
              <div class="info-item">
                <span class="label">세금 납부</span>
                <span class="val ${taxOverdueClass}">납부: ${c.taxPaid}천원 (체납: ${c.taxOverdueCurrent}천원)</span>
              </div>
              <div class="info-item">
                <span class="label">전과 기록</span>
                <span class="val ${criminalClass}">${c.criminal}</span>
              </div>
              <div class="info-item" style="grid-column: span 2;">
                <span class="label">주요 경력</span>
                <span class="val">${c.career || '기록 없음'}</span>
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
    const val = parseInt(wealthStr.replace(/,/g, ''), 10);
    if (isNaN(val)) return wealthStr;
    if (val >= 1000000) {
      const eok = Math.floor(val / 100000);
      const nam = Math.round((val % 100000) / 100);
      return `${(eok / 10).toFixed(1)}억원 (${wealthStr}천원)`;
    }
    return `${wealthStr}천원`;
  }
});
