const IDB = "BrunoListV2";
let orders = JSON.parse(localStorage.getItem("bruno_v2_orders") || "[]");
let ordersDir = null;
let pdfDir = null;
let pdfNames = [];

function today() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function toast(m) {
  const el = document.getElementById("toast");
  el.textContent = m; el.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
}
function openIdb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("h");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(k,v){ const db=await openIdb(); return new Promise((res,rej)=>{ const t=db.transaction("h","readwrite"); t.objectStore("h").put(v,k); t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); }); }
async function idbGet(k){ const db=await openIdb(); return new Promise((res,rej)=>{ const q=db.transaction("h","readonly").objectStore("h").get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); }

function status() {
  const p = [];
  if (ordersDir) p.push(`Orders folder linked`);
  if (pdfDir) p.push(`${pdfNames.length} PDFs`);
  document.getElementById("status").textContent = p.join(" · ") || "Link folders to deploy";
}
function persist(){ localStorage.setItem("bruno_v2_orders", JSON.stringify(orders)); }

function rowHtml() {
  return `<div class="add-row grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-2xl bg-cream-50 border border-cream-200">
    <div><label class="text-[10px] font-bold uppercase text-slate-400">Order date</label><input type="date" class="od w-full px-2 py-1.5 rounded-lg border text-sm" value="${today()}" /></div>
    <div><label class="text-[10px] font-bold uppercase text-slate-400">Due date</label><input type="date" class="dd w-full px-2 py-1.5 rounded-lg border text-sm" value="${today()}" /></div>
    <div><label class="text-[10px] font-bold uppercase text-slate-400">Designation</label><select class="des w-full px-2 py-1.5 rounded-lg border text-sm"><option>Wolfsteel</option><option>NAC</option></select></div>
    <div><label class="text-[10px] font-bold uppercase text-slate-400">Part #</label><input type="text" list="pdfList" class="pn w-full px-2 py-1.5 rounded-lg border text-sm" placeholder="autocomplete from PDFs" /></div>
    <div><label class="text-[10px] font-bold uppercase text-slate-400">Qty</label><input type="number" min="1" value="1" class="qy w-full px-2 py-1.5 rounded-lg border text-sm" /></div>
    <div><label class="text-[10px] font-bold uppercase text-slate-400">Unique PO</label><input type="text" class="po w-full px-2 py-1.5 rounded-lg border text-sm" /></div>
  </div>`;
}
function openAdd() {
  document.getElementById("addRows").innerHTML = rowHtml();
  document.getElementById("addModal").classList.remove("hidden");
}
function closeAdd(){ document.getElementById("addModal").classList.add("hidden"); }
function addRow(){ document.getElementById("addRows").insertAdjacentHTML("beforeend", rowHtml()); }
function commitAdds() {
  const rows = [...document.querySelectorAll("#addRows .add-row")];
  let added = 0;
  for (const r of rows) {
    const orderDate = r.querySelector(".od").value || today();
    const dueDate = r.querySelector(".dd").value || today();
    const designation = r.querySelector(".des").value;
    const partNo = r.querySelector(".pn").value.trim();
    const qty = parseInt(r.querySelector(".qy").value, 10) || 1;
    const po = r.querySelector(".po").value.trim();
    if (!partNo || !po) { alert("Each row needs Part # and PO"); return; }
    if (orders.some(o => o.po.toLowerCase() === po.toLowerCase())) {
      alert(`Duplicate PO: ${po}`); return;
    }
    orders.push({ orderDate, dueDate, designation, partNo, qty, po });
    added++;
  }
  persist(); render(); closeAdd();
  toast(`Added ${added} order(s)`);
}

async function setOrdersFolder() {
  if (!window.showDirectoryPicker) return alert("Use Chrome/Edge");
  try {
    ordersDir = await window.showDirectoryPicker({ mode: "readwrite" });
    await idbSet("ordersDir", ordersDir);
    status(); toast("Orders folder linked");
  } catch(e){ if (e.name !== "AbortError") console.error(e); }
}
async function setPdfFolder() {
  if (!window.showDirectoryPicker) return alert("Use Chrome/Edge");
  try {
    pdfDir = await window.showDirectoryPicker({ mode: "read" });
    await idbSet("pdfDir", pdfDir);
    await scanPdfs();
    status(); toast(`${pdfNames.length} PDF name(s) for autocomplete`);
  } catch(e){ if (e.name !== "AbortError") console.error(e); }
}
async function scanPdfs() {
  pdfNames = [];
  if (!pdfDir) return;
  async function walk(dir) {
    for await (const e of dir.values()) {
      if (e.kind === "file" && e.name.toLowerCase().endsWith(".pdf"))
        pdfNames.push(e.name.replace(/\.pdf$/i, ""));
      else if (e.kind === "directory") { try { await walk(e); } catch(_){} }
    }
  }
  await walk(pdfDir);
  const dl = document.getElementById("pdfList");
  dl.innerHTML = pdfNames.map(n => `<option value="${n.replace(/"/g,"&quot;")}"></option>`).join("");
}

function ordersCsv() {
  let c = "DateAdded,DueDate,Qty,Part,Designation,PO\n";
  orders.forEach(o => {
    c += [o.orderDate, o.dueDate, o.qty, `"${o.partNo}"`, `"${o.designation}"`, `"${o.po}"`].join(",") + "\n";
  });
  return "\ufeff" + c;
}
async function deployOrders() {
  if (!orders.length) return alert("Nothing to deploy");
  if (!ordersDir) return alert("Link Orders Folder first");
  const stamp = today().replace(/-/g,"") + "_" + new Date().toTimeString().slice(0,5).replace(":","") ;
  const name = `orders_${stamp}.csv`;
  const fh = await ordersDir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(ordersCsv());
  await w.close();
  toast(`Deployed ${name}`);
}
async function viewEditList() {
  if (!ordersDir) return alert("Link Orders Folder first");
  // list csv files
  const files = [];
  for await (const e of ordersDir.values()) {
    if (e.kind === "file" && e.name.toLowerCase().endsWith(".csv")) files.push(e);
  }
  if (!files.length) return alert("No CSV lists in folder");
  const pick = prompt("Type exact filename to load:\n" + files.map(f => f.name).join("\n"));
  if (!pick) return;
  const match = files.find(f => f.name === pick.trim());
  if (!match) return alert("File not found");
  const file = await match.getFile();
  let text = await file.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.trim().split(/\r?\n/);
  const next = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const v = parseCsv(lines[i]);
    if (!v[3] && !v[5]) continue;
    next.push({ orderDate: v[0], dueDate: v[1], qty: parseInt(v[2],10)||1, partNo: v[3], designation: v[4]||"Wolfsteel", po: v[5] });
  }
  orders = next; persist(); render();
  toast(`Loaded ${orders.length} from ${match.name}`);
}
function parseCsv(row) {
  const out=[]; let cur="", q=false;
  for (const ch of row) {
    if (ch==='"') q=!q;
    else if (ch===',' && !q){ out.push(cur); cur=""; }
    else cur+=ch;
  }
  out.push(cur);
  return out.map(x => x.replace(/^"|"$/g,"").trim());
}
function deleteOrder(i){ orders.splice(i,1); persist(); render(); }
function clearList(){ if (!confirm("Clear working list?")) return; orders=[]; persist(); render(); }
function render() {
  document.getElementById("count").textContent = `(${orders.length})`;
  const tb = document.getElementById("table");
  if (!orders.length) tb.innerHTML = `<tr><td colspan="7" class="text-center text-slate-400 py-8">Add orders, then Deploy to the orders folder</td></tr>`;
  else tb.innerHTML = orders.map((o,i) => `<tr>
    <td>${o.orderDate||""}</td><td>${o.dueDate||""}</td><td>${o.designation||""}</td>
    <td>${o.partNo||""}</td><td>${o.qty}</td><td class="font-semibold">${o.po||""}</td>
    <td><button class="btn-action btn-delete btn-trendy" onclick="deleteOrder(${i})">Del</button></td>
  </tr>`).join("");
  if (window.lucide) lucide.createIcons();
}
async function restore() {
  try {
    const od = await idbGet("ordersDir");
    if (od) { let p = await od.queryPermission({mode:"readwrite"}); if (p!=="granted") p=await od.requestPermission({mode:"readwrite"}); if (p==="granted") ordersDir=od; }
    const pd = await idbGet("pdfDir");
    if (pd) { let p = await pd.queryPermission({mode:"read"}); if (p!=="granted") p=await pd.requestPermission({mode:"read"}); if (p==="granted"){ pdfDir=pd; await scanPdfs(); } }
  } catch(e){ console.warn(e); }
  status();
}
document.addEventListener("DOMContentLoaded", async () => { await restore(); render(); if (window.lucide) lucide.createIcons(); });
