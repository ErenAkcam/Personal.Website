// ==========================================
// REFERANS YÖNETİMİ - JSON DYNAMIC LOADING
// ==========================================

// Referans verilerini saklayacak global değişken
let referencesData = [];

/**
 * Sayfa yüklendiğinde refs.json'u çek
 */
function loadReferencesFromJSON() {
  const refsUrl = 'refs.json'; // Aynı repo içinde
  
  fetch(refsUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error('refs.json yüklenmedi');
      }
      return response.json();
    })
    .then(data => {
      referencesData = data.references || [];
      console.log('Referanslar yüklendi:', referencesData.length);
      
      // Referans bölümü varsa ve görünürse, grid'i doldur
      updateReferencesDisplay();
    })
    .catch(error => {
      console.error('Referans yükleme hatası:', error);
      // Fallback: boş array
      referencesData = [];
    });
}

/**
 * Referans sayfasındaki grid'i JSON verilerine göre güncelle
 */
function updateReferencesDisplay() {
  const grid = document.querySelector('.ref-list'); // ref-list sınıfını kullan
  if (!grid || referencesData.length === 0) return;

  grid.innerHTML = ''; // Temizle

  referencesData.forEach(ref => {
    const refCard = document.createElement('div');
    refCard.className = 'reference-card';
    refCard.innerHTML = `
      <div class="ref-card-header">
        <h3>${escapeHTML(ref.name)}</h3>
        <span class="ref-role">${escapeHTML(ref.role)}</span>
      </div>
      <div class="ref-card-body">
        <p class="ref-company"><strong>Şirket:</strong> ${escapeHTML(ref.company)}</p>
        <p class="ref-relation"><strong>İlişki:</strong> ${escapeHTML(ref.relationship)}</p>
        <p class="ref-period"><strong>Dönem:</strong> ${escapeHTML(ref.period)}</p>
        <p class="ref-context"><strong>Bağlam:</strong> ${escapeHTML(ref.context)}</p>
        <blockquote class="ref-message">"${escapeHTML(ref.recommendation)}"</blockquote>
        <div class="ref-footer">
          <a href="mailto:${escapeHTML(ref.email)}" class="ref-link">E-mail Gönder</a>
          ${ref.phone ? `<a href="tel:${escapeHTML(ref.phone)}" class="ref-link">Ara</a>` : ''}
        </div>
      </div>
    `;
    grid.appendChild(refCard);
  });
}

/**
 * HTML special karakterlerden koru (XSS önleme)
 */
function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * FORM GÖNDERME - Google Apps Script'e veri gönder
 */
function submitReferenceForm() {
  // Form verilerini topla
  const formData = {
    refName: document.getElementById('ref-name')?.value || '',
    refRole: document.getElementById('ref-role')?.value || '',
    refCompany: document.getElementById('ref-company')?.value || '',
    refRelation: document.getElementById('ref-relation')?.value || '',
    refPeriod: document.getElementById('ref-period')?.value || '',
    refEmail: document.getElementById('ref-email')?.value || '',
    refPhone: document.getElementById('ref-phone')?.value || '',
    refMessage: document.getElementById('ref-message')?.value || '',
    refContext: document.getElementById('ref-context')?.value || '' // rp-context
  };

  // Validasyon
  if (!formData.refName || !formData.refEmail) {
    showMessage('Lütfen tüm zorunlu alanları doldurun', 'error');
    return;
  }

  // Google Apps Script URL'i (deploy sonrası alacaksınız)
  const GAS_URL = 'https://script.google.com/macros/d/YOUR_SCRIPT_ID/useless'; 
  // Yukarıdaki URL'i Scripts kendi URL'i ile değiştir

  // Gönder
  fetch(GAS_URL, {
    method: 'POST',
    mode: 'no-cors', // CORS sorunlarından kaçınmak için
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(formData)
  })
  .then(() => {
    showMessage('Referans başarıyla gönderildi!', 'success');
    
    // Form temizle
    document.getElementById('ref-name').value = '';
    document.getElementById('ref-role').value = '';
    document.getElementById('ref-company').value = '';
    document.getElementById('ref-relation').value = '';
    document.getElementById('ref-period').value = '';
    document.getElementById('ref-email').value = '';
    document.getElementById('ref-phone').value = '';
    document.getElementById('ref-message').value = '';

    // 2 saniye sonra referansları yenile
    setTimeout(() => {
      loadReferencesFromJSON();
    }, 2000);
  })
  .catch(error => {
    console.error('Form gönderme hatası:', error);
    showMessage('Gönderme sırasında hata oluştu', 'error');
  });
}

/**
 * Mesaj göster
 */
function showMessage(msg, type) {
  const msgEl = document.getElementById('form-message') || document.createElement('div');
  msgEl.id = 'form-message';
  msgEl.className = `message ${type}`;
  msgEl.textContent = msg;
  msgEl.style.cssText = `
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-weight: 600;
    ${type === 'error' ? 'background: #ffebee; color: #c62828;' : 'background: #e8f5e9; color: #2e7d32;'}
  `;

  const form = document.querySelector('.ref-form');
  if (form) form.prepend(msgEl);

  setTimeout(() => msgEl.remove(), 4000);
}

/**
 * Sayfa yüklendiğinde çalıştır
 */
document.addEventListener('DOMContentLoaded', () => {
  loadReferencesFromJSON();
});

// Cache temizleme için versiyonlama
function getRefsJsonUrl() {
  return `refs.json?v=${new Date().getTime()}`; // Caching sorunlarını önle
}
