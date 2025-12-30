
// ====== Config e dati ======
/* const frase = "LA RUOTA DELLA FORTUNA";
let fraseNascosta = frase.replace(/[A-Z]/g, "_");
const categoria = "Detti"; */



/* ===== Offuscamento: XOR + Base64 (decodifica) =====
   ATTENZIONE: SALT è definito in frasi_data.js
*/
function toUint8(str) { return new TextEncoder().encode(str); }
function fromUint8(u8) { return new TextDecoder().decode(u8); }

function decodeBase64Xor(b64, secret) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const key = toUint8(secret);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] ^ key[i % key.length];
  return fromUint8(out);
}

function makeSecret(idx) {
  return `${SALT}-${String(idx).padStart(2, "0")}`;
}

/* ===== Normalizzazione accenti (E ≡ È/É, ecc.) ===== */
const ACCENT_MAP = {
  'À':'A', 'È':'E', 'É':'E', 'Ì':'I', 'Ò':'O', 'Ù':'U'
};

// Tutte le lettere considerate “lettere” da mascherare (A-Z + vocali accentate)
const LETTERS_RE = /[A-ZÀÈÉÌÒÙ]/;

function normalizeChar(ch) {
  const up = ch.toUpperCase();
  return ACCENT_MAP[up] || up;
}

function isLetterToMask(ch) {
  return LETTERS_RE.test(ch.toUpperCase());
}


// Stato frase dinamico
let numeroFraseSelezionato = null;
let frase = "";
let categoria = "";
let fraseNascosta = "";

// DOM extra (se hai aggiunto lo span per il numero)
const numeroFraseEl = document.getElementById("numeroFrase");

// Maschera tutte le lettere (incluse accentate), lascia visibili spazi, apostrofi, numeri, punteggiatura.
function mascheraFrase(testuale) {
  return [...testuale].map(ch => isLetterToMask(ch) ? "_" : ch).join("");
}


function scegliNumeroFrase() {
  // prova a recuperare scelta precedente
  const salvato = localStorage.getItem("numeroFrase");
  let num = salvato !== null ? Number(salvato) : NaN;

  if (!Number.isInteger(num) || num < 0 || num > 106) {
    const input = prompt("Inserisci il numero della frase (0–106):");
    num = Number(input);
  }
  if (!Number.isInteger(num) || num < 0 || num > 106) {
    alert("Valore non valido. Uso 0 (frase di test).");
    num = 0;
  }

  numeroFraseSelezionato = num;
  localStorage.setItem("numeroFrase", String(num));

  if (num <= 100) {
    // Decodifica da FRASI_ENC (offuscate)
    const voce = FRASI_ENC[num]; // fornita da frasi_data.js
    const secret = makeSecret(num);
    const chiaro = decodeBase64Xor(voce.testoEnc, secret);
    frase = chiaro.toUpperCase();
    categoria = (voce.categoria || "GENERICA").toUpperCase();
  } else {
    // 101..106: in chiaro per test
    const t = FRASI_TEST.find(x => x.indice === num);
    if (!t) {
      alert("Indice di test non trovato. Uso 0.");
      return scegliNumeroFrase(0);
    }
    frase = t.testo.toUpperCase();
    categoria = (t.categoria || "TEST").toUpperCase();
  }

  fraseNascosta = mascheraFrase(frase);

  if (numeroFraseEl) numeroFraseEl.textContent = `(Frase #${numeroFraseSelezionato})`;
  
  logAction(`Selezionata frase → #${numeroFraseSelezionato} [${categoria}]`);
}

const giocatori = [
  { nome: "Giocatore 1", soldi: 0 },
  { nome: "Giocatore 2", soldi: 0 },
  { nome: "Giocatore 3", soldi: 0 }
];


// ===== Nomi dinamici per i giocatori =====
function chiediNomiGiocatori() {
  // Prova a caricare da localStorage
  const salvati = JSON.parse(localStorage.getItem('nomiGiocatori') || 'null');

  let nomi;
  if (Array.isArray(salvati) && salvati.length === 3 && salvati.every(n => typeof n === 'string')) {
    nomi = salvati;
  } else {
    // Chiede i nomi con fallback
    const n1 = (prompt('Nome Giocatore 1:') || '').trim() || 'Giocatore 1';
    const n2 = (prompt('Nome Giocatore 2:') || '').trim() || 'Giocatore 2';
    const n3 = (prompt('Nome Giocatore 3:') || '').trim() || 'Giocatore 3';
    nomi = [n1.toUpperCase(), n2.toUpperCase(), n3.toUpperCase()];
    // Salva per la prossima volta
    localStorage.setItem('nomiGiocatori', JSON.stringify(nomi));
  }

  // Aggiorna l'array giocatori (mantiene i soldi correnti)
  giocatori[0].nome = nomi[0];
  giocatori[1].nome = nomi[1];
  giocatori[2].nome = nomi[2];
}

// Opzionale: funzione per resettare e richiedere nuovamente i nomi
function reimpostaNomiGiocatori() {
  localStorage.removeItem('nomiGiocatori');
  chiediNomiGiocatori();
  aggiornaUI();
  infoBox.textContent = 'Nomi giocatori aggiornati.';
}


let turno = 0;
let specialeValore = 5000;
const ruotaValori = [
  200, 700, 300, 600, "PASSA", 800, 400, 100, 500, 300,
  "BANCAROTTA", 800, 200, 600, 300, 500, "PASSA", 400, 200, 700,
  100, 500, "BANCAROTTA", "SPECIALE"
];
const spicchiCount = ruotaValori.length;
const angoloSpicchio = 360 / spicchiCount;
let rotazione = 0; let valoreRuota = null; let ruotaInMovimento = false; let letteraInserita = true; let gameFinito = false; // quando true, blocca interazioni e pulsanti
const vocali = ["A","E","I","O","U"]; let lettereUsate = []; let consonanteUsata = false;

// DOM
const giocatoriPunteggiDiv = document.getElementById("giocatoriPunteggi");
const categoriaEl = document.getElementById("testoCategoria");
const tabellone = document.getElementById("tabellone");
const infoBox = document.getElementById("infoBox");
const btnRuota = document.getElementById("btnRuota");
const btnVocale = document.getElementById("btnVocale");
const btnRisposta = document.getElementById("btnRisposta");
const wheelRotGroup = document.getElementById("wheelRotGroup");


// ===== Logger Azioni =====
const logPanel = document.getElementById('logPanel');
const logListEl = document.getElementById('logList');
const btnToggleLog = document.getElementById('btnToggleLog');
const btnCambiaFrase = document.getElementById('btnCambiaFrase');

// Stato e persistenza visibilità log
const LOG_VIS_KEY = 'logVisible';
if (localStorage.getItem(LOG_VIS_KEY) === '1') {
  logPanel?.removeAttribute('hidden');
}

function timeHHMMSS() {
  const d = new Date();
  return d.toLocaleTimeString('it-IT', { hour12: false });
}
function logAction(msg) {
  if (!logListEl) return;
  const line = `[${timeHHMMSS()}] ${msg}`;
  const row = document.createElement('div');
  row.textContent = line;
  logListEl.appendChild(row);
  logListEl.scrollTop = logListEl.scrollHeight;
}

// Toggle pannello log
btnToggleLog?.addEventListener('click', () => {
  if (!logPanel) return;
  const hidden = logPanel.hasAttribute('hidden');
  if (hidden) {
    logPanel.removeAttribute('hidden');
    localStorage.setItem(LOG_VIS_KEY, '1');
  } else {
    logPanel.setAttribute('hidden', '');
    localStorage.setItem(LOG_VIS_KEY, '0');
  }
});


// Ruota & testi
const START_ANGLE = 0; const CLOCKWISE = true;
const BORDER_STROKE_W = 2, GAP_FRACTION = 0.25;
const PADDING_OUTER_NUM = Math.max(BORDER_STROKE_W*GAP_FRACTION, 1.5);
const PADDING_INNER_NUM = 3; const NUM_FONT_SIZE = 7.2; const WORD_FONT_SIZE = 6.6;
const NUM_STEP_FACTOR = 0.98; const WORD_STEP_FACTOR = 1.00; const EURO_SCALE = 0.78; const EURO_GAP_STEPS = 0.75;
const WORD_ASC_ADJ = 0.35; const NUM_ASC_ADJ = 0.45;

// ===== Utility =====
function polarToCart(cx, cy, r, deg){ const rad=(deg-90)*Math.PI/180; return [cx+r*Math.cos(rad), cy+r*Math.sin(rad)]; }
function wedgePath(cx,cy,rO,rI,s,e){ const [x1,y1]=polarToCart(cx,cy,rO,s); const [x2,y2]=polarToCart(cx,cy,rO,e); const [xi1,yi1]=polarToCart(cx,cy,rI,e); const [xi2,yi2]=polarToCart(cx,cy,rI,s); const la=(e-s)>180?1:0; return `M ${x1} ${y1} A ${rO} ${rO} 0 ${la} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${rI} ${rI} 0 ${la} 0 ${xi2} ${yi2} Z`; }
function norm360(a){ a%=360; if(a<0)a+=360; return a; }
const palette=['#ffb74d','#4fc3f7','#aed581','#f48fb1','#fff176','#ce93d8','#80cbc4','#ef9a9a','#90caf9','#ffe082','#ba68c8','#81c784','#ff8a65','#9575cd','#a5d6a7','#ffcc80','#4dd0e1','#b39ddb','#c5e1a5','#f06292','#ffeb3b','#9fa8da','#ffccbc','#4db6ac'];

// ===== Tabellone: NO WRAP tra lettere di una parola =====
function aggiornaTabellone() {
  tabellone.innerHTML = "";
  const parole = frase.split(" ");
  let k = 0;
  for (let p = 0; p < parole.length; p++) {
    const parola = parole[p];
    while (frase[k] === " ") k++;
    const parolaDiv = document.createElement("div");
    parolaDiv.className = "parola";
    for (let i = 0; i < parola.length; i++) {
      const tile = document.createElement("div");
      tile.className = "lettera";
      tile.textContent = (fraseNascosta[k] === "_") ? "" : fraseNascosta[k];
      parolaDiv.appendChild(tile);
      k++;
    }
    tabellone.appendChild(parolaDiv);
    if (frase[k] === " ") k++;
  }
}

// ===== Verifica lettera (restituisce occorrenze) =====
function verificaLettera_old(lettera, valore, passTurnOnZero=false) {
  let trovate = 0; let nuova = fraseNascosta.split("");
  for (let i = 0; i < frase.length; i++) { if (frase[i] === lettera) { nuova[i] = lettera; trovate++; } }
  fraseNascosta = nuova.join("");
  if (trovate > 0 && valore > 0) {
    giocatori[turno].soldi += valore * trovate;
    infoBox.textContent = `La lettera '${lettera}' presente ${trovate} volta${trovate > 1 ? "e" : ""}`;
  }
  if (trovate === 0 && (valore > 0 || passTurnOnZero)) {
    infoBox.textContent = `La lettera '${lettera}' non è presente`;
    cambiaTurno();
  }
  if (trovate > 0 && !lettereUsate.includes(lettera)) {
    lettereUsate.push(lettera);
  }
  aggiornaUI();
  if (!fraseNascosta.includes("_")) { infoBox.textContent = `🎉 Complimenti! ${giocatori[turno].nome} ha indovinato la frase!`; }
  return trovate;
}


function verificaLettera(lettera, valore, passTurnOnZero=false) {
  let trovate = 0;
  const nuova = [...fraseNascosta];

  for (let i = 0; i < frase.length; i++) {
    const ch = frase[i];                        // carattere reale (può essere accentato)
    if (!isLetterToMask(ch)) continue;          // spazi, apostrofi, numeri, ecc. saltano
    const base = normalizeChar(ch);             // base senza accento
    if (base === lettera && nuova[i] === "_") { // se combacia e non già svelata
      nuova[i] = ch;                            // mostra la lettera originale (accentata se era accentata)
      trovate++;
    }
  }

  fraseNascosta = nuova.join("");
  
  
if (trovate > 0) {
  logAction(`Lettera ${lettera}: ${trovate} occorrenza/e (+${typeof valore === 'number' && valore > 0 ? valore * trovate : 0} €)`);
}


  if (trovate > 0 && typeof valore === "number" && valore > 0) {
    giocatori[turno].soldi += valore * trovate;
    infoBox.textContent = `La lettera '${lettera}' presente ${trovate} volta${trovate > 1 ? "e" : ""}`;
  }

if (
  trovate === 0 &&
  ( (typeof valore === 'number' && valore > 0) || passTurnOnZero )
) {
  infoBox.textContent = `La lettera '${lettera}' non è presente`;
  logAction(`Lettera ${lettera}: assente → passa il turno`);
  cambiaTurno();
}



  if (trovate > 0 && !lettereUsate.includes(lettera)) {
    lettereUsate.push(lettera);
  }

  aggiornaUI();

  if (!fraseNascosta.includes("_")) {
    infoBox.textContent = `🎉 Complimenti! ${giocatori[turno].nome} ha indovinato la frase!`;
  }

  return trovate;
}



// ===== UI complessiva =====
function aggiornaUI(){
  categoriaEl.textContent=categoria;
  if (numeroFraseEl) numeroFraseEl.textContent = `(Frase #${numeroFraseSelezionato})`;
  aggiornaTabellone();
  giocatoriPunteggiDiv.innerHTML='';
  giocatori.forEach((g,i)=>{
    const d=document.createElement('div');
    d.classList.add('giocatore');
    if(i===turno) d.classList.add('turno');
    d.innerHTML=`<div class="nome">${g.nome}</div><div class="soldi">${g.soldi} €</div>`;
    giocatoriPunteggiDiv.appendChild(d);
  });
  
  
  // Se gameFinito è true, tutto disabilitato
  if (gameFinito) {
    btnRuota.disabled = true;
    btnVocale.disabled = true;
    btnRisposta.disabled = true;
    return;
  }

  
  btnRuota.disabled = ruotaInMovimento || (letteraInserita === false);
  const costoVocale = 500;
  const saldo = giocatori[turno].soldi;
  btnVocale.disabled = ruotaInMovimento || (saldo < costoVocale);
  btnRisposta.disabled = ruotaInMovimento;
}

function cambiaTurno(){ turno=(turno+1)%giocatori.length; valoreRuota=null; consonanteUsata=false; letteraInserita=true;logAction(`Turno → ${giocatori[turno].nome}`);aggiornaUI(); }

// ===== Ruota (disegno + etichette verticali) =====
function creaEtichettaVerticale(ns,cx,cy,rO,rI,cDeg,val){ const isNum=typeof val==='number'; const display=String(val); const fs=isNum?NUM_FONT_SIZE:WORD_FONT_SIZE; const pOut=isNum?PADDING_OUTER_NUM:2.0; const pIn=isNum?PADDING_INNER_NUM:3; const asc=isNum?NUM_ASC_ADJ:WORD_ASC_ADJ; const rStartRaw=rO-pOut; const rStartEff=rStartRaw-fs*asc; const rEnd=rI+pIn; const chars=[...display]; const steps=Math.max(chars.length-1,1); const avail=Math.max((rStartEff-rEnd),1e-6); const step=Math.min(fs*(isNum?NUM_STEP_FACTOR:WORD_STEP_FACTOR), avail/steps); const g=document.createElementNS(ns,'g'); g.setAttribute('transform',`rotate(${cDeg} ${cx} ${cy})`); const t=document.createElementNS(ns,'text'); t.setAttribute('x',cx); t.setAttribute('text-anchor','middle'); t.setAttribute('dominant-baseline','middle'); t.setAttribute('font-size',`${fs}px`); if(display==='BANCAROTTA'){ t.setAttribute('fill','#fff'); t.setAttribute('stroke','#7a0000'); } else if(display==='PASSA'){ t.setAttribute('fill','#fff'); t.setAttribute('stroke','#7a4a00'); } else if(display==='SPECIALE'){ t.setAttribute('fill','#eaffea'); t.setAttribute('stroke','#006f2d'); } chars.forEach((ch,i)=>{ const s=document.createElementNS(ns,'tspan'); s.setAttribute('x',cx); const y=cy-(rStartEff - i*step); s.setAttribute('y',y); s.textContent=ch; t.appendChild(s); }); if(isNum){ const euro=document.createElementNS(ns,'tspan'); euro.setAttribute('x',cx); const iEuroIdeal=(chars.length-1)+EURO_GAP_STEPS; const maxIndex=(rStartEff-rEnd)/step; const iEuro=Math.min(iEuroIdeal,maxIndex); const yEuro=cy-(rStartEff - iEuro*step); euro.setAttribute('y',yEuro); euro.textContent='€'; euro.setAttribute('font-size',`${(fs*EURO_SCALE).toFixed(2)}px`); t.appendChild(euro); } g.appendChild(t); return g; }
function disegnaRuota(){ const ns='http://www.w3.org/2000/svg'; const cx=50,cy=50; const rO=48, rI=18; wheelRotGroup.innerHTML=''; for(let i=0;i<spicchiCount;i++){ const s=START_ANGLE+i*angoloSpicchio; const e=START_ANGLE+(i+1)*angoloSpicchio; const c=s+angoloSpicchio/2; const path=document.createElementNS(ns,'path'); path.setAttribute('d',wedgePath(cx,cy,rO,rI,s,e)); path.setAttribute('fill',palette[i%palette.length]); path.setAttribute('stroke','#222'); path.setAttribute('stroke-width','0.5'); wheelRotGroup.appendChild(path); const lab=creaEtichettaVerticale(ns,cx,cy,rO,rI,c,ruotaValori[i]); wheelRotGroup.appendChild(lab);} }

// ===== Giro ruota (indice da stato finale) =====
function giraRuota(){ if (ruotaInMovimento || letteraInserita === false) return; ruotaInMovimento=true; btnRuota.disabled=true; infoBox.textContent='La ruota sta girando...'; const idx=Math.floor(Math.random()*spicchiCount); const centro=START_ANGLE+idx*angoloSpicchio+angoloSpicchio/2; const current=norm360(rotazione); const target=CLOCKWISE?norm360(-centro):norm360(centro); let delta=target-current; delta=((delta%360)+360)%360; const giriExtra=360*(2+Math.floor(Math.random()*3)); const step=CLOCKWISE?(giriExtra+delta):-(giriExtra+(delta==0?0:(360-delta))); rotazione+=step; wheelRotGroup.style.transition='transform 5s cubic-bezier(0.25,0.1,0,1)'; wheelRotGroup.style.transform=`rotate(${rotazione}deg)`; setTimeout(()=>{ const final=norm360(rotazione); const angleAtPointer=CLOCKWISE?norm360(-final):final; const fromStart=norm360(angleAtPointer-START_ANGLE); const i=Math.floor(fromStart/angoloSpicchio)%spicchiCount; valoreRuota=ruotaValori[i]; if(valoreRuota==='SPECIALE'){ valoreRuota=specialeValore; infoBox.textContent=`🎉 Spicchio SPECIALE! Valore: ${valoreRuota} €`; } else if(valoreRuota==='PASSA'){ infoBox.textContent='Passa il turno!'; ruotaInMovimento=false; letteraInserita=true; consonanteUsata=false; cambiaTurno(); aggiornaUI(); return; } else if(valoreRuota==='BANCAROTTA'){ infoBox.textContent='Bancarotta! Soldi azzerati.'; giocatori[turno].soldi=0; ruotaInMovimento=false; letteraInserita=true; consonanteUsata=false; cambiaTurno(); aggiornaUI(); return; } else { infoBox.textContent=`È uscito: ${valoreRuota} €`; } ruotaInMovimento=false; letteraInserita=false; consonanteUsata=false; 
if (valoreRuota === 'SPECIALE') {
  // già nel tuo codice imposti specialeValore
  logAction(`Ruota: SPECIALE → ${specialeValore} €`);
} else if (valoreRuota === 'PASSA') {
  logAction('Ruota: PASSA → cambio turno');
} else if (valoreRuota === 'BANCAROTTA') {
  logAction(`Ruota: BANCAROTTA → azzera ${giocatori[turno].nome}`);
} else {
  logAction(`Ruota: ${valoreRuota} €`);
}
aggiornaUI(); },5100); }

// ===== Eventi =====
document.addEventListener('keydown',e=>{ if (gameFinito) return;               // <<< blocca input se partita finita
if(ruotaInMovimento) return; if(!valoreRuota || typeof valoreRuota!=='number') return; if(consonanteUsata){ infoBox.textContent='Devi girare la ruota oppure comprare una vocale'; return;} const lettera=e.key.toUpperCase(); if(!/^[A-Z]$/.test(lettera)) return; if(vocali.includes(lettera)) return; if(lettereUsate.includes(lettera)) { infoBox.textContent='Lettera già indovinata in precedenza.'; return; } consonanteUsata=true; letteraInserita=true; const trovate = verificaLettera(lettera, valoreRuota, false); });

function compraVocale(){ if(ruotaInMovimento) return; const costo=500; if (giocatori[turno].soldi < costo){ infoBox.textContent=`Non hai abbastanza soldi per comprare una vocale (costa ${costo} €).`; return; } const lettera=prompt('Inserisci una vocale (A, E, I, O, U)')?.toUpperCase(); if(!lettera) return; if(!vocali.includes(lettera)) { infoBox.textContent='Inserisci una vocale valida (A, E, I, O, U).'; return; } if(lettereUsate.includes(lettera)) { infoBox.textContent='Vocale già indovinata in precedenza.'; return; } giocatori[turno].soldi -= costo; // addebito
	logAction(`${giocatori[turno].nome} compra vocale '${lettera}' (−500 €)`);
 const trovate = verificaLettera(lettera, 0, true); aggiornaUI(); }


function provaRisposta() {
  if (ruotaInMovimento) return;
  const r = prompt('Inserisci la frase completa:')?.toUpperCase()?.trim();
  if (!r) return;

  if (r === frase) {
    // Bonus se il vincitore ha 0 €
    if (giocatori[turno].soldi === 0) {
      giocatori[turno].soldi += 1000;
      infoBox.textContent = `🎉 Risposta corretta! Bonus 1000 € a ${giocatori[turno].nome}.`;
    } else {
      infoBox.textContent = `🎉 Complimenti! ${giocatori[turno].nome} ha indovinato la frase!`;
    }
	logAction(`RISPOSTA CORRETTA da ${giocatori[turno].nome} → "${frase}"`);
    // Mostra tutta la frase
    fraseNascosta = frase;

    // Azzera i punteggi degli altri giocatori
    giocatori.forEach((g, i) => {
      if (i !== turno) g.soldi = 0;
    });

    // Segna fine partita e blocca pulsanti
    gameFinito = true;
    btnRuota.disabled = true;
    btnVocale.disabled = true;
    btnRisposta.disabled = true;

    aggiornaUI();
    return;
  } else {
  logAction(`Risposta sbagliata da ${giocatori[turno].nome} → passa il turno`);
    infoBox.textContent = 'Risposta sbagliata! Passa il turno.';
    cambiaTurno();
    aggiornaUI();
  }
}


function cambiaNumeroFrase() {
  // chiede nuovo numero (0–106)
  const current = localStorage.getItem('numeroFrase') ?? '0';
  const input = prompt('Inserisci il numero della frase (0–106):', current);
  if (input === null) return; // annullato
  const num = Number(input);
  if (!Number.isInteger(num) || num < 0 || num > 106) {
    alert('Valore non valido (0–106).');
    return;
  }
  localStorage.setItem('numeroFrase', String(num));

  // Carica la nuova frase
  numeroFraseSelezionato = num;
  if (num <= 100) {
    const voce = FRASI_ENC[num];
    const chiaro = decodeBase64Xor(voce.testoEnc, makeSecret(num));
    frase = chiaro.toUpperCase();
    categoria = (voce.categoria || 'GENERICA').toUpperCase();
  } else {
    const t = FRASI_TEST.find(x => x.indice === num);
    if (!t) {
      alert('Indice di test non trovato.');
      return;
    }
    frase = t.testo.toUpperCase();
    categoria = (t.categoria || 'TEST').toUpperCase();
  }

  // Reset stato partita
  lettereUsate = [];
  fraseNascosta = mascheraFrase(frase);
  gameFinito = false;
  valoreRuota = null;
  ruotaInMovimento = false;
  letteraInserita = true;
  consonanteUsata = false;
  giocatori.forEach(g => g.soldi = 0);
  turno = 0;

  // UI + log
  infoBox.textContent = 'Nuova frase caricata.';
  logAction(`Cambiata frase → #${numeroFraseSelezionato} [${categoria}]`);
  aggiornaUI();
}

// Evento pulsante
btnCambiaFrase?.addEventListener('click', cambiaNumeroFrase);


btnRuota.addEventListener('click',giraRuota);
btnVocale.addEventListener('click',compraVocale);
btnRisposta.addEventListener('click',provaRisposta);


(function init() {
  disegnaRuota();
  chiediNomiGiocatori();    // 1) Nomi
  scegliNumeroFrase();      // 2) Numero 0..106 (decodifica o test)
  aggiornaUI();             // 3) UI
})();


