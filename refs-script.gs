// ============================================================
//  EREN AKÇAM — REFERANS KAYIT SCRIPTI
//  Google Apps Script → GitHub refs.json
//  refs.json yapısı: { "refs": [...], "approved": [...] }
//  Bu script SADECE "refs" listesine yazar, "approved" listesine
//  dokunmaz (okurken aynen alır, yazarken aynen geri koyar).
//
//  YENİ: Her yeni referans GitHub'a yazıldıktan sonra, referansın
//  tüm içeriğini (isim, şirket, açıklama, iletişim bilgisi vb.)
//  gösteren bir bildirim e-postası eren.akcamm@gmail.com adresine
//  gönderilir (bkz. sendNewReferenceEmail_). E-posta gönderimi
//  başarısız olsa bile referansın GitHub'a yazılması engellenmez —
//  mail hatası ayrıca loglanır ve yutulur.
//
//  KARAKTER (UTF-8) SORUNU İÇİN NOT:
//  e.postData.contents, Apps Script'in gelen isteğin Content-Type
//  charset'ine göre yaptığı OTOMATİK decode sonucudur. Tarayıcı
//  taraflı 'no-cors' isteklerinde charset bilgisi bozulabildiği
//  için bu otomatik decode yanlış sonuç verip "—", "ç", "ı", "İ"
//  gibi karakterleri bozuyordu (mojibake).
//  Bunun önüne geçmek için burada e.postData.contents yerine
//  ham byte dizisi (getBytes) açıkça UTF-8 olarak decode ediliyor.
//  Bu, gelen isteğin Content-Type / charset header'ı ne olursa
//  olsun her zaman doğru sonucu garanti eder.
//
//  Proje Özellikleri (Script Properties) üzerinden çekilir:
//    GITHUB_TOKEN     → github_pat_xxxxxxx
//    GITHUB_OWNER     → ErenAkcam
//    GITHUB_REPO      → Personal.Website
//    GITHUB_FILE_PATH → refs.json
//    NOTIFY_EMAIL     → eren.akcamm@gmail.com  (opsiyonel; boşsa
//                        aşağıdaki sabit adres kullanılır)
// ============================================================

var PROPS = PropertiesService.getScriptProperties();

// Script Properties'te NOTIFY_EMAIL tanımlanmazsa bu adrese düşer.
var DEFAULT_NOTIFY_EMAIL = 'eren.akcamm@gmail.com';

function getConfig() {
  return {
    token:    PROPS.getProperty('GITHUB_TOKEN'),
    owner:    PROPS.getProperty('GITHUB_OWNER'),
    repo:     PROPS.getProperty('GITHUB_REPO'),
    filePath: PROPS.getProperty('GITHUB_FILE_PATH') || 'refs.json',
    notifyEmail: PROPS.getProperty('NOTIFY_EMAIL') || DEFAULT_NOTIFY_EMAIL
  };
}

// ── CORS NOTU ─────────────────────────────────────────────────
// ContentService.createTextOutput() ile dönen TextOutput nesnesinde
// .setHeader() veya .setHeaders() diye bir metot YOK (resmi API'de
// sadece append/clear/setContent/setMimeType/downloadAsFile var).
// Önceki versiyonlardaki "output.setHeader/setHeaders is not a
// function" hataları bu yüzdendi — Apps Script Web App'lerde custom
// response header set etmenin bir yolu yok. CORS, script.google.com'un
// kendi proxy katmanı tarafından otomatik hallediliyor; index.html
// tarafında 'text/plain' content-type kullanıldığı için zaten
// preflight (OPTIONS) hiç tetiklenmiyor, bu yüzden CORS header'larına
// hiç ihtiyaç yok. doOptions() yine de zararsız bir fallback olarak
// bırakıldı.

// ── OPTIONS preflight ────────────────────────────────────────
function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ── GET: mevcut refs.json içeriğini döndür (opsiyonel) ───────
// ?debug=mailerror eklenirse son e-posta gönderim hatasını,
// ?debug=mailstatus eklenirse hem son başarı hem son hatayı döndürür
// (e-postaların gidip gitmediğini teşhis etmek için).
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.debug === 'mailerror') {
      var lastErr = PropertiesService.getScriptProperties().getProperty('LAST_MAIL_ERROR') || '(kayıtlı hata yok)';
      return ContentService
        .createTextOutput(JSON.stringify({ lastMailError: lastErr }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (e && e.parameter && e.parameter.debug === 'mailstatus') {
      var p = PropertiesService.getScriptProperties();
      return ContentService
        .createTextOutput(JSON.stringify({
          lastMailOk: p.getProperty('LAST_MAIL_OK') || '(henüz başarılı gönderim yok)',
          lastMailError: p.getProperty('LAST_MAIL_ERROR') || '(kayıtlı hata yok)',
          notifyEmail: getConfig().notifyEmail
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var data = readDataFromGitHub();
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({error: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── POST: yeni referansı "refs" listesine ekle ────────────────
function doPost(e) {
  try {
    // Gelen body'yi HER ZAMAN UTF-8 olarak decode et.
    // e.postData.contents kullanmıyoruz çünkü o, isteğin
    // Content-Type/charset header'ına güvenerek otomatik decode
    // yapar — header bozuksa (örn. tarayıcı no-cors ile charset'i
    // değiştirdiyse) sonuç da bozuk çıkar. getBytes() + Utilities
    // ile ham byte'lardan açıkça UTF-8 decode ederek bu riski
    // tamamen ortadan kaldırıyoruz.
    var rawText = Utilities.newBlob(e.postData.getBytes())
                            .getDataAsString('UTF-8');
    var newRef = JSON.parse(rawText);

    // Zorunlu alan kontrolü
    if (!newRef.name || !newRef.desc) {
      throw new Error('name ve desc alanları zorunludur.');
    }

    // Mevcut veriyi GitHub'dan oku ({ refs, approved })
    var data = readDataFromGitHub();

    // Yeni referansı SADECE refs listesine ekle (en başa — en yeni üstte)
    data.refs.unshift(newRef);
    // data.approved'a hiç dokunulmuyor, aynen korunuyor

    // Güncellenmiş veriyi GitHub'a yaz
    writeDataToGitHub(data);

    // Referans başarıyla GitHub'a kaydedildikten hemen sonra bildirim
    // e-postasını gönder. (Önceki sürümde bu adım bir tetikleyiciye
    // ertelenmişti, ancak bu yöntem ek bir yetkilendirme kapsamı
    // gerektirebiliyor ve sessizce başarısız olabiliyordu. Kullanıcı
    // e-postanın biraz gecikmeli gelmesini sorun etmediği için, daha az
    // hata noktası olan basit/senkron gönderime geri dönüldü.)
    // Mail başarısız olsa bile kullanıcıya success dönülür çünkü asıl
    // kayıt (GitHub) zaten tamamlandı — ama hata teşhis için Script
    // Properties'e yazılır (doGet?debug=mailerror ile okunabilir).
    var props = PropertiesService.getScriptProperties();
    try {
      sendNewReferenceEmail_(newRef, data.refs.length);
      props.setProperty('LAST_MAIL_OK', (newRef.name || '?') + ' @ ' + new Date().toISOString());
    } catch (mailErr) {
      var msg = mailErr.message + ' | ref: ' + (newRef && newRef.name);
      console.error('Bildirim e-postası gönderilemedi: ' + msg);
      props.setProperty('LAST_MAIL_ERROR', msg + ' @ ' + new Date().toISOString());
    }

    return ContentService
      .createTextOutput(JSON.stringify({success: true, total: data.refs.length}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({error: err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Yeni referans bildirim e-postası ───────────────────────────
// newRef tipik olarak şu alanları içerir (index.html formundan):
//   name, title, company, context, period, rating, desc, email, phone, linkedin
// Form hangi alanları göndermezse o satır e-postada atlanır.
function sendNewReferenceEmail_(ref, totalCount) {
  var cfg = getConfig();
  var to = cfg.notifyEmail;
  if (!to) return;

  var subject = '📩 Yeni Referans: ' + (ref.name || 'İsimsiz');

  var rows = [];
  function addRow(label, value) {
    if (value === undefined || value === null || value === '') return;
    rows.push(label + ': ' + value);
  }
  addRow('Ad Soyad', ref.name);
  addRow('Unvan', ref.title);
  addRow('Şirket', ref.company);
  addRow('İlişki / Bağlam', ref.context);
  addRow('Dönem', ref.period);
  addRow('Puan', ref.rating ? (ref.rating + ' / 5') : '');
  addRow('E-posta', ref.email);
  addRow('Telefon', ref.phone);
  addRow('LinkedIn', ref.linkedin);

  var plainBody =
    'Sitenize yeni bir referans gönderildi.

' +
    rows.join('
') +
    '

Referans Metni:
' + (ref.desc || '(boş)') +
    '

---
Toplam bekleyen/kayıtlı referans sayısı: ' + totalCount +
    '
Bu referansı incelemek ve onaylamak için admin panelindeki ' +
    '"References" sayfasını açın.';

  var htmlRows = rows.map(function(r) {
    var parts = r.split(': ');
    var label = parts.shift();
    var value = parts.join(': ');
    return '<tr><td style="padding:4px 10px 4px 0;color:#6b7d72;font-weight:600;white-space:nowrap">' +
      escapeHtml_(label) + '</td><td style="padding:4px 0;color:#1f2d24">' + escapeHtml_(value) + '</td></tr>';
  }).join('');

  var htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">' +
    '<h2 style="color:#2d5a3d;margin-bottom:4px">Yeni Referans Geldi</h2>' +
    '<p style="color:#6b7d72;font-size:13px;margin-top:0">Eren Akçam — Personal.Website</p>' +
    '<table style="border-collapse:collapse;width:100%;margin:14px 0">' + htmlRows + '</table>' +
    '<div style="background:#f4f8f5;border-left:4px solid #2d5a3d;padding:12px 16px;border-radius:6px;margin:14px 0">' +
    '<strong style="display:block;margin-bottom:6px;color:#2d5a3d">Referans Metni</strong>' +
    '<span style="white-space:pre-wrap;color:#1f2d24">' + escapeHtml_(ref.desc || '(boş)') + '</span>' +
    '</div>' +
    '<p style="font-size:12px;color:#9aa79f">Toplam bekleyen/kayıtlı referans sayısı: ' + totalCount + '</p>' +
    '<p style="font-size:12px;color:#9aa79f">Bu referansı incelemek ve onaylamak için admin panelindeki ' +
    '<strong>References</strong> sayfasını açın.</p>' +
    '</div>';

  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody
  });
}

function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── GitHub'dan refs.json'u oku ({ refs, approved } objesi) ────
function readDataFromGitHub() {
  var cfg = getConfig();
  var url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo +
            '/contents/' + cfg.filePath;

  var response = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': 'token ' + cfg.token,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GoogleAppsScript'
    },
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code === 404) {
    // Dosya yoksa varsayılan yapıyla başla
    return { refs: [], approved: [] };
  }
  if (code !== 200) {
    throw new Error('GitHub GET hatası: ' + code + ' ' + response.getContentText());
  }

  var data = JSON.parse(response.getContentText());
  // GitHub dosya içeriğini base64 olarak döndürür — UTF-8 olarak decode ediyoruz
  var content = Utilities.newBlob(Utilities.base64Decode(data.content.replace(/
/g, '')))
                          .getDataAsString('UTF-8');

  var parsed = JSON.parse(content || '{}');

  // Güvenlik: alanlar yoksa boş array ile başlat (eski formatla uyum için)
  if (!parsed.refs) parsed.refs = [];
  if (!parsed.approved) parsed.approved = [];

  return parsed;
}

// ── { refs, approved } objesini GitHub'a yaz ──────────────────
function writeDataToGitHub(data) {
  var cfg = getConfig();
  var url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo +
            '/contents/' + cfg.filePath;

  // Mevcut dosyanın SHA'sını al (güncelleme için gerekli)
  var getSha = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': 'token ' + cfg.token,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GoogleAppsScript'
    },
    muteHttpExceptions: true
  });

  var sha = null;
  if (getSha.getResponseCode() === 200) {
    sha = JSON.parse(getSha.getContentText()).sha;
  }

  // JSON içeriğini güzel formatlı ve UTF-8 olarak yaz
  var jsonContent = JSON.stringify(data, null, 2);
  var encoded = Utilities.base64Encode(
    Utilities.newBlob(jsonContent, 'text/plain', 'UTF-8').getBytes()
  );

  var payload = {
    message: 'ref: yeni referans eklendi (' + new Date().toISOString() + ')',
    content: encoded,
    branch: 'main'
  };
  if (sha) payload.sha = sha;

  var putResponse = UrlFetchApp.fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': 'token ' + cfg.token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'GoogleAppsScript'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var putCode = putResponse.getResponseCode();
  if (putCode !== 200 && putCode !== 201) {
    throw new Error('GitHub PUT hatası: ' + putCode + ' ' + putResponse.getContentText());
  }
}
function testMailQuota_() {
  Logger.log('Kalan günlük kota: ' + MailApp.getRemainingDailyQuota());
}