/***************************************
 * DAFTAR HARGA - GOOGLE APPS SCRIPT
 * Backend: Google Sheets + Apps Script
 ***************************************/

const APP = {
  SHEETS: {
    CONFIG: 'CONFIG',
    VENDORS: 'VENDORS',
    ITEMS: 'ITEMS',
    ACCOUNTS: 'ACCOUNTS'
  },
  SESSION_SECONDS: 21600, // 6 jam
  PPn: 0.11
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Daftar Harga - Furnifan Mebel Surabaya')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('theme-color', '#166534')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Jalankan sekali setelah project dibuat.
 * Membuat sheet, header, dan akun awal.
 */
function setupApp() {
  const ss = getSpreadsheet_();

  // IMPORTANT: setupApp TIDAK menghapus data yang sudah ada.
  ensureSheet_(ss, APP.SHEETS.CONFIG, [['KEY','VALUE']]);
  ensureSheet_(ss, APP.SHEETS.VENDORS, [['ID','NAMA_VENDOR','TELP_WA','PRODUCT','CREATED_AT','UPDATED_AT']]);
  ensureSheet_(ss, APP.SHEETS.ITEMS, [['ID','NAMA_BARANG','VENDOR_ID','HARGA_AWAL','DISKON_1','DISKON_2','DISKON_3','DISKON_4','DISKON_5','PPN_AKTIF','PPN_RATE','HARGA_AKHIR','CREATED_AT','UPDATED_AT']]);
  ensureSheet_(ss, APP.SHEETS.ACCOUNTS, [['ID','USERNAME','PASSWORD','ROLE','ACTIVE','CREATED_AT','UPDATED_AT']]);

  const csh = ss.getSheetByName(APP.SHEETS.CONFIG);
  const defaults = [
    ['ADMIN_USERNAME','Furnifan'],
    ['ADMIN_PASSWORD','Admin'],
    ['USER_USERNAME','User'],
    ['USER_PASSWORD','User123'],
    ['APP_NAME','Daftar Harga Furnifan Mebel Surabaya']
  ];
  if (csh.getLastRow() <= 1) csh.getRange(2,1,defaults.length,2).setValues(defaults);

  migrateLegacyAccounts_();
  return {ok:true,message:'Setup selesai tanpa menghapus data yang sudah ada.'};
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1,1,1,headers[0].length).setValues(headers);
    sh.setFrozenRows(1);
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers[0].length).setValues(headers);
  }
  return sh;
}


function login(username, password) {
  username = String(username || '').trim();
  password = String(password || '');

  migrateLegacyAccounts_();
  const account = findAccountByCredentials_(username, password);
  if (!account) throw new Error('Username atau password salah.');

  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('SESSION_' + token, JSON.stringify({
    username: account.username,
    role: account.role,
    accountId: account.id,
    createdAt: Date.now()
  }), APP.SESSION_SECONDS);

  const cfg = getConfig_();
  return {ok:true, token:token, role:account.role, username:account.username, appName:cfg.APP_NAME || 'Daftar Harga'};
}


function logout(token) {
  if (token) CacheService.getScriptCache().remove('SESSION_' + token);
  return {ok: true};
}

function getSession(token) {
  return requireSession_(token);
}

/* =========================
   VENDORS
   ========================= */

function getVendors(token) {
  requireSession_(token);
  const sh = getSheet_(APP.SHEETS.VENDORS);
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];

  return values.slice(1).filter(r => r[0]).map(r => ({
    id: String(r[0]),
    name: String(r[1] || ''),
    phone: String(r[2] || ''),
    product: String(r[3] || ''),
    createdAt: formatDate_(r[4]),
    updatedAt: formatDate_(r[5])
  }));
}

function saveVendor(token, data) {
  requireFullAdmin_(token);
  data = data || {};

  const name = String(data.name || '').trim();
  const phone = String(data.phone || '').trim();
  const product = String(data.product || '').trim();

  if (!name) throw new Error('Nama vendor wajib diisi.');

  const sh = getSheet_(APP.SHEETS.VENDORS);
  const now = new Date();

  if (data.id) {
    const row = findRowById_(sh, String(data.id));
    if (!row) throw new Error('Vendor tidak ditemukan.');
    sh.getRange(row, 2, 1, 5).setValues([[name, phone, product, sh.getRange(row, 5).getValue() || now, now]]);
    return {ok: true, message: 'Vendor berhasil diperbarui.'};
  }

  const id = makeId_('V');
  sh.appendRow([id, name, phone, product, now, now]);
  return {ok: true, message: 'Vendor berhasil ditambahkan.'};
}

function deleteVendor(token, id) {
  requireFullAdmin_(token);
  id = String(id || '').trim();
  if (!id) throw new Error('ID vendor tidak valid.');

  const vsh = getSheet_(APP.SHEETS.VENDORS);
  const row = findRowById_(vsh, id);
  if (!row) throw new Error('Vendor tidak ditemukan.');

  // Jangan izinkan menghapus vendor yang masih dipakai barang.
  const ish = getSheet_(APP.SHEETS.ITEMS);
  const values = ish.getDataRange().getValues();
  const used = values.slice(1).some(r => String(r[2]) === id);
  if (used) {
    throw new Error('Vendor masih digunakan oleh daftar barang. Hapus/pindahkan barang tersebut terlebih dahulu.');
  }

  vsh.deleteRow(row);
  return {ok: true, message: 'Vendor berhasil dihapus.'};
}

/* =========================
   ITEMS
   ========================= */

function getItems(token) {
  requireSession_(token);

  const sh = getSheet_(APP.SHEETS.ITEMS);
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];

  return values.slice(1).filter(r => r[0]).map(r => ({
    id: String(r[0]),
    name: String(r[1] || ''),
    vendorId: String(r[2] || ''),
    price: num_(r[3]),
    discounts: [num_(r[4]), num_(r[5]), num_(r[6]), num_(r[7]), num_(r[8])],
    ppnActive: String(r[9]).toUpperCase() === 'TRUE' || r[9] === true,
    ppnRate: num_(r[10]) || APP.PPn,
    finalPrice: num_(r[11]),
    createdAt: formatDate_(r[12]),
    updatedAt: formatDate_(r[13])
  }));
}

function saveItem(token, data) {
  requireItemEditor_(token);
  data = data || {};

  const name = String(data.name || '').trim();
  const vendorId = String(data.vendorId || '').trim();
  const price = num_(data.price);
  const discounts = [
    num_(data.discount1),
    num_(data.discount2),
    num_(data.discount3),
    num_(data.discount4),
    num_(data.discount5)
  ];
  const ppnActive = Boolean(data.ppnActive);
  const ppnRate = ppnActive ? (num_(data.ppnRate) || APP.PPn) : 0;

  if (!name) throw new Error('Nama barang wajib diisi.');
  if (!vendorId) throw new Error('Vendor wajib dipilih.');
  if (price < 0) throw new Error('Harga awal tidak boleh negatif.');
  discounts.forEach((d, i) => {
    if (d < 0 || d > 100) throw new Error('Diskon ' + (i + 1) + ' harus 0 sampai 100%.');
  });

  const vendor = getVendors(token).find(v => v.id === vendorId);
  if (!vendor) throw new Error('Vendor tidak ditemukan.');

  const finalPrice = calculateFinalPrice_(price, discounts, ppnActive, ppnRate);
  const sh = getSheet_(APP.SHEETS.ITEMS);
  const now = new Date();

  if (data.id) {
    const row = findRowById_(sh, String(data.id));
    if (!row) throw new Error('Barang tidak ditemukan.');

    const created = sh.getRange(row, 13).getValue() || now;
    sh.getRange(row, 2, 1, 13).setValues([[
      name, vendorId, price,
      discounts[0], discounts[1], discounts[2], discounts[3], discounts[4],
      ppnActive, ppnRate, finalPrice, created, now
    ]]);

    return {ok: true, message: 'Barang berhasil diperbarui.', finalPrice: finalPrice};
  }

  const id = makeId_('I');
  sh.appendRow([
    id, name, vendorId, price,
    discounts[0], discounts[1], discounts[2], discounts[3], discounts[4],
    ppnActive, ppnRate, finalPrice, now, now
  ]);

  return {ok: true, message: 'Barang berhasil ditambahkan.', finalPrice: finalPrice};
}

function deleteItem(token, id) {
  requireItemEditor_(token);
  id = String(id || '').trim();

  const sh = getSheet_(APP.SHEETS.ITEMS);
  const row = findRowById_(sh, id);
  if (!row) throw new Error('Barang tidak ditemukan.');

  sh.deleteRow(row);
  return {ok: true, message: 'Barang berhasil dihapus.'};
}

function calculatePrice(price, discounts, ppnActive, ppnRate) {
  // Bisa dipakai UI untuk preview harga.
  requireSession_(arguments[0]);
}

/**
 * Fungsi server untuk perhitungan harga.
 * Pemanggilan dari client tidak diperlukan karena UI juga menghitung,
 * tetapi tetap tersedia untuk konsistensi backend.
 */
function previewPrice(token, price, discounts, ppnActive, ppnRate) {
  requireSession_(token);
  const ds = Array.isArray(discounts) ? discounts.map(num_) : [0,0,0,0,0];
  while (ds.length < 5) ds.push(0);
  return calculateFinalPrice_(num_(price), ds.slice(0,5), Boolean(ppnActive), num_(ppnRate) || APP.PPn);
}

/* =========================
   CONFIG / DATA
   ========================= */

function getAppData(token) {
  const session = requireSession_(token);
  return {
    session: session,
    config: getConfig_(),
    vendors: getVendors(token),
    items: getItems(token)
  };
}

function getAccounts(token) {
  requireFullAdmin_(token);
  migrateLegacyAccounts_();
  const sh = getSheet_(APP.SHEETS.ACCOUNTS);
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];
  return values.slice(1).filter(r => r[0]).map(r => ({
    id:String(r[0]), username:String(r[1] || ''), password:String(r[2] || ''),
    role:normalizeRole_(r[3]), active:(String(r[4]).toUpperCase() === 'TRUE' || r[4] === true),
    createdAt:formatDate_(r[5]), updatedAt:formatDate_(r[6])
  }));
}

function saveAccount(token, data) {
  requireFullAdmin_(token);
  data = data || {};
  const id = String(data.id || '').trim();
  const username = String(data.username || '').trim();
  const password = String(data.password || '');
  const role = normalizeRole_(data.role);
  const active = data.active !== false;
  if (!username || !password) throw new Error('Username dan password wajib diisi.');
  if (!['admin','semi_admin','user'].includes(role)) throw new Error('Role tidak valid.');

  const sh = getSheet_(APP.SHEETS.ACCOUNTS);
  const rows = sh.getDataRange().getValues();
  const duplicate = rows.slice(1).some(r => String(r[1]).trim().toLowerCase() === username.toLowerCase() && String(r[0]) !== id);
  if (duplicate) throw new Error('Username sudah digunakan.');

  if (id) {
    const row = findRowById_(sh,id);
    if (!row) throw new Error('Akun tidak ditemukan.');
    const existingRole = normalizeRole_(sh.getRange(row,4).getValue());
    const existingActive = String(sh.getRange(row,5).getValue()).toUpperCase() === 'TRUE' || sh.getRange(row,5).getValue() === true;
    if (existingRole === 'admin' && (role !== 'admin' || !active) && existingActive && countActiveAdmins_(sh, id) <= 0) {
      throw new Error('Minimal harus ada satu akun Admin aktif.');
    }
    sh.getRange(row,2,1,5).setValues([[username,password,role,active,sh.getRange(row,6).getValue() || new Date()]]);
    sh.getRange(row,7).setValue(new Date());
    return {ok:true,message:'Akun berhasil diperbarui.'};
  }
  if (role === 'admin' || role === 'semi_admin' || role === 'user') {
    const now = new Date();
    sh.appendRow([makeId_('A'),username,password,role,active,now,now]);
  }
  return {ok:true,message:'Akun berhasil ditambahkan.'};
}

function deleteAccount(token, id) {
  const session = requireFullAdmin_(token);
  id = String(id || '').trim();
  const sh = getSheet_(APP.SHEETS.ACCOUNTS);
  const row = findRowById_(sh,id);
  if (!row) throw new Error('Akun tidak ditemukan.');
  if (String(sh.getRange(row,1).getValue()) === String(session.accountId)) throw new Error('Akun yang sedang digunakan tidak dapat dihapus.');
  const role = normalizeRole_(sh.getRange(row,4).getValue());
  const active = String(sh.getRange(row,5).getValue()).toUpperCase() === 'TRUE' || sh.getRange(row,5).getValue() === true;
  if (role === 'admin' && active && countActiveAdmins_(sh,id) <= 1) throw new Error('Tidak dapat menghapus Admin terakhir.');
  sh.deleteRow(row);
  return {ok:true,message:'Akun berhasil dihapus.'};
}

function migrateLegacyAccounts_() {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(APP.SHEETS.ACCOUNTS) || ensureSheet_(ss,APP.SHEETS.ACCOUNTS,[['ID','USERNAME','PASSWORD','ROLE','ACTIVE','CREATED_AT','UPDATED_AT']]);
  if (sh.getLastRow() > 1) return;
  const cfg = getConfig_();
  const now = new Date();
  const rows = [];
  if (cfg.ADMIN_USERNAME && cfg.ADMIN_PASSWORD) rows.push([makeId_('A'),cfg.ADMIN_USERNAME,cfg.ADMIN_PASSWORD,'admin',true,now,now]);
  if (cfg.USER_USERNAME && cfg.USER_PASSWORD && cfg.USER_USERNAME !== cfg.ADMIN_USERNAME) rows.push([makeId_('A'),cfg.USER_USERNAME,cfg.USER_PASSWORD,'user',true,now,now]);
  if (rows.length) sh.getRange(2,1,rows.length,7).setValues(rows);
}

function findAccountByCredentials_(username,password) {
  const sh = getSheet_(APP.SHEETS.ACCOUNTS);
  const values = sh.getDataRange().getValues();
  for (let i=1;i<values.length;i++) {
    const r=values[i];
    const active=String(r[4]).toUpperCase()==='TRUE' || r[4]===true;
    if (active && String(r[1]).trim()===username && String(r[2])===password) return {id:String(r[0]),username:String(r[1]),role:normalizeRole_(r[3])};
  }
  return null;
}

function normalizeRole_(role) {
  const r=String(role || '').toLowerCase().replace(/[ -]/g,'_');
  if (r==='semiadmin' || r==='semi_admin') return 'semi_admin';
  if (r==='admin') return 'admin';
  return 'user';
}

function countActiveAdmins_(sh, excludeId) {
  const values=sh.getDataRange().getValues();
  return values.slice(1).filter(r => String(r[0])!==String(excludeId) && normalizeRole_(r[3])==='admin' && (String(r[4]).toUpperCase()==='TRUE'||r[4]===true)).length;
}

function changeCredentials(token, data) {
  requireFullAdmin_(token);
  data = data || {};
  const adminUsername=String(data.adminUsername||'').trim(), adminPassword=String(data.adminPassword||'');
  const userUsername=String(data.userUsername||'').trim(), userPassword=String(data.userPassword||'');
  if(!adminUsername||!adminPassword||!userUsername||!userPassword) throw new Error('Semua username dan password wajib diisi.');
  migrateLegacyAccounts_();
  const sh=getSheet_(APP.SHEETS.ACCOUNTS), rows=sh.getDataRange().getValues();
  const admin=rows.slice(1).find(r=>normalizeRole_(r[3])==='admin');
  const user=rows.slice(1).find(r=>normalizeRole_(r[3])==='user');
  if(admin){const row=findRowById_(sh,String(admin[0])); sh.getRange(row,2,1,2).setValues([[adminUsername,adminPassword]]);}
  else sh.appendRow([makeId_('A'),adminUsername,adminPassword,'admin',true,new Date(),new Date()]);
  if(user){const row=findRowById_(sh,String(user[0])); sh.getRange(row,2,1,2).setValues([[userUsername,userPassword]]);}
  else sh.appendRow([makeId_('A'),userUsername,userPassword,'user',true,new Date(),new Date()]);
  return {ok:true,message:'Akun utama berhasil diperbarui.'};
}


function seedDemoData(token) {
  requireFullAdmin_(token);
  const ss = getSpreadsheet_();
  const vsh = getSheet_(APP.SHEETS.VENDORS);
  const ish = getSheet_(APP.SHEETS.ITEMS);

  // Hapus data lama (tetap pertahankan header).
  if (vsh.getLastRow() > 1) vsh.getRange(2,1,vsh.getLastRow()-1,vsh.getLastColumn()).clearContent();
  if (ish.getLastRow() > 1) ish.getRange(2,1,ish.getLastRow()-1,ish.getLastColumn()).clearContent();

  const now = new Date();
  const vendors = [
    [makeId_('V'), 'PT Mebel Nusantara', '0812-1111-2233', 'Sofa, Kursi, Meja', now, now],
    [makeId_('V'), 'CV Furni Jaya', '0822-3333-4455', 'Lemari, Rak, Meja', now, now],
    [makeId_('V'), 'UD Interior Makmur', '0856-7777-8899', 'Kasur, Bedset, Furniture', now, now]
  ];
  vsh.getRange(2,1,vendors.length,6).setValues(vendors);

  const examples = [
    ['Sofa Minimalis 3 Dudukan', vendors[0][0], 4500000, 10, 5, 0, 0, 0, true],
    ['Kursi Makan Kayu Premium', vendors[0][0], 1250000, 7, 3, 2, 0, 0, true],
    ['Meja Meeting 180 cm', vendors[1][0], 3750000, 12, 5, 0, 0, 0, false],
    ['Lemari 3 Pintu', vendors[1][0], 5200000, 8, 4, 0, 0, 0, true],
    ['Bedset Premium 160x200', vendors[2][0], 6800000, 10, 5, 3, 0, 0, true]
  ];

  const rows = examples.map(e => {
    const price = e[2];
    const ds = e.slice(3,8);
    const ppnActive = e[8];
    const rate = ppnActive ? APP.PPn : 0;
    const finalPrice = calculateFinalPrice_(price, ds, ppnActive, rate);
    return [makeId_('I'), e[0], e[1], price, ds[0], ds[1], ds[2], ds[3], ds[4],
      ppnActive, rate, finalPrice, now, now];
  });
  ish.getRange(2,1,rows.length,14).setValues(rows);

  return {ok:true, message:'Data contoh berhasil dimasukkan: 3 vendor dan 5 barang.'};
}

function exportCsv(token) {
  requireFullAdmin_(token);
  const items = getItems(token);
  const vendors = getVendors(token);
  const header = ['Nama Barang','Vendor','Harga Awal','Diskon 1','Diskon 2','Diskon 3','Diskon 4','Diskon 5','PPN','Harga Akhir'];
  const lines = [header];
  items.forEach(i => {
    const v = vendors.find(x => x.id === i.vendorId);
    lines.push([
      i.name, v ? v.name : '', i.price,
      i.discounts[0], i.discounts[1], i.discounts[2], i.discounts[3], i.discounts[4],
      i.ppnActive ? (i.ppnRate*100) : 0, i.finalPrice
    ]);
  });
  return lines.map(row => row.map(csvEscape_).join(',')).join('\r\n');
}
function csvEscape_(v) {
  const s = String(v == null ? '' : v);
  return '"' + s.replace(/"/g,'""') + '"';
}

/* =========================
   CALCULATION
   ========================= */

/**
 * Diskon bertingkat/berurutan:
 * Harga x (1-d1) x (1-d2) ... x (1-d5)
 * kemudian + PPN 11% bila aktif.
 *
 * Contoh:
 * 1.000.000, diskon 10%, lalu 5%
 * = 1.000.000 x 90% x 95% = 855.000
 * PPN 11% = 94.050
 * Net = 949.050
 */
function calculateFinalPrice_(price, discounts, ppnActive, ppnRate) {
  let result = Math.max(0, Number(price) || 0);

  (discounts || []).forEach(d => {
    const pct = Math.max(0, Math.min(100, Number(d) || 0));
    result = result * (1 - pct / 100);
  });

  if (ppnActive) {
    const rate = Math.max(0, Number(ppnRate) || APP.PPn);
    result = result * (1 + rate);
  }

  return roundMoney_(result);
}

/* =========================
   HELPERS
   ========================= */

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');

  if (id) return SpreadsheetApp.openById(id);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('Spreadsheet belum terhubung. Buka Apps Script dari Google Sheet atau isi SPREADSHEET_ID di Script Properties.');
  }
  return active;
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" belum ada. Jalankan setupApp() sekali.');
  return sh;
}

function createOrResetSheet_(ss, name, rows) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();

  if (rows && rows.length) {
    sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  }

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  sh.autoResizeColumns(1, rows[0].length);
}

function getConfig_() {
  const sh = getSheet_(APP.SHEETS.CONFIG);
  const values = sh.getDataRange().getValues();
  const obj = {};

  values.slice(1).forEach(r => {
    if (r[0]) obj[String(r[0])] = String(r[1] == null ? '' : r[1]);
  });

  return obj;
}

function setConfigValue_(sh, key, value) {
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

function requireSession_(token) {
  token = String(token || '');
  if (!token) throw new Error('Sesi tidak valid. Silakan login ulang.');

  const raw = CacheService.getScriptCache().get('SESSION_' + token);
  if (!raw) throw new Error('Sesi telah berakhir. Silakan login ulang.');

  return JSON.parse(raw);
}

function requireFullAdmin_(token) {
  const session = requireSession_(token);
  if (session.role !== 'admin') throw new Error('Akses ditolak. Hanya Admin yang memiliki hak ini.');
  return session;
}

function requireItemEditor_(token) {
  const session = requireSession_(token);
  if (session.role !== 'admin' && session.role !== 'semi_admin') {
    throw new Error('Akses ditolak. Akun User hanya dapat melihat data.');
  }
  return session;
}

function findRowById_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return null;

  const values = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === id) return i + 2;
  }
  return null;
}

function makeId_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
}

function num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === '') return 0;

  // Mendukung input Indonesia: 1.234.567,89
  let s = String(v).trim().replace(/\s/g, '');
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.indexOf(',') >= 0) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function roundMoney_(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function formatDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  }
  return String(v);
}
