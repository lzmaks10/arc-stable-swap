// ArcStable - Stablecoin FX Router
// Wallet interaction, swap routing, LP management

// ─── Token Registry ───
var TOKENS = [
  { symbol: "USDC",  name: "USD Coin",        icon: "u", cls: "usdc", decimals: 6, address: "0x3600000000000000000000000000000000000000" },
  { symbol: "EURC",  name: "Euro Coin",       icon: "e", cls: "eurc", decimals: 6, address: "0x0000000000000000000000000000000000000001" },
  { symbol: "KRW1",  name: "Korean Won",      icon: "₩", cls: "krw1", decimals: 6, address: "0x0000000000000000000000000000000000000002" },
  { symbol: "JPYC",  name: "JPY Coin",        icon: "¥", cls: "jpyc", decimals: 6, address: "0x0000000000000000000000000000000000000003" },
  { symbol: "GBPT",  name: "Poundtoken",      icon: "£", cls: "gbpt", decimals: 6, address: "0x0000000000000000000000000000000000000004" },
  { symbol: "BRZ",   name: "Brazilian Digital",icon: "R", cls: "brz",  decimals: 6, address: "0x0000000000000000000000000000000000000005" },
  { symbol: "MXNB",  name: "Mexican Peso",    icon: "M", cls: "mxnb", decimals: 6, address: "0x0000000000000000000000000000000000000006" },
  { symbol: "SGDX",  name: "Singapore Dollar", icon: "S", cls: "sgdx", decimals: 6, address: "0x0000000000000000000000000000000000000007" },
  { symbol: "NGNX",  name: "Naira Stable",    icon: "N", cls: "ngnx", decimals: 6, address: "0x0000000000000000000000000000000000000008" },
  { symbol: "AEDC",  name: "Dirham Coin",     icon: "D", cls: "aedc", decimals: 6, address: "0x0000000000000000000000000000000000000009" },
];

var ARC = { chainId: 5042002, rpc: "https://rpc.testnet.arc.network", explorer: "https://testnet.arcscan.app/tx/" };

// ─── State ───
var provider = null, signer = null, userAddress = null, contract = null;
var CONTRACT_ADDRESS = "", CONTRACT_ABI = [];
var selectedFrom = TOKENS[0]; // USDC
var selectedTo = TOKENS[1];   // EURC
var tokenModalMode = "from";
var txIdCounter = 0;

// Mock pool data (will be replaced with on-chain data when contract is deployed)
var mockPools = [
  { pair: "USDC/EURC", t: "7D +2.4%", tvl: 84210000, vol24h: 12400000, fee: 4, apr: 6.8, util: 42, token0: TOKENS[0], token1: TOKENS[1] },
  { pair: "USDC/KRW1", t: "7D +1.8%", tvl: 21840000, vol24h: 4120000,  fee: 6, apr: 11.2, util: 61, token0: TOKENS[0], token1: TOKENS[2] },
  { pair: "USDC/JPYC", t: "7D +3.1%", tvl: 38910000, vol24h: 6780000,  fee: 5, apr: 8.4, util: 55, token0: TOKENS[0], token1: TOKENS[3] },
  { pair: "USDC/GBPT", t: "7D +1.2%", tvl: 19220000, vol24h: 2310000,  fee: 5, apr: 7.1, util: 38, token0: TOKENS[0], token1: TOKENS[4] },
  { pair: "USDC/BRZ",  t: "7D +4.2%", tvl: 9410000,  vol24h: 1870000,  fee: 8, apr: 14.6, util: 72, token0: TOKENS[0], token1: TOKENS[5] },
  { pair: "USDC/MXNB", t: "7D +3.5%", tvl: 7120000,  vol24h: 1240000,  fee: 7, apr: 12.9, util: 66, token0: TOKENS[0], token1: TOKENS[6] },
  { pair: "USDC/SGDX", t: "7D +0.9%", tvl: 5840000,  vol24h: 920000,   fee: 6, apr: 9.2,  util: 49, token0: TOKENS[0], token1: TOKENS[7] },
  { pair: "EURC/GBPT", t: "7D +1.6%", tvl: 3410000,  vol24h: 410000,   fee: 8, apr: 10.4, util: 51, token0: TOKENS[1], token1: TOKENS[4] },
];

// Rates (1 token0 → token1)
var fxRates = {
  "USDC/EURC": 0.92404, "EURC/USDC": 1.0822,
  "USDC/KRW1": 1377.20, "KRW1/USDC": 0.000726,
  "USDC/JPYC": 156.25,  "JPYC/USDC": 0.0064,
  "USDC/GBPT": 0.78742, "GBPT/USDC": 1.2699,
  "USDC/BRZ":  5.0007,  "BRZ/USDC":  0.19997,
  "USDC/MXNB": 19.5394, "MXNB/USDC": 0.05118,
  "USDC/SGDX": 1.3521,  "SGDX/USDC": 0.7395,
  "USDC/NGNX": 1612.58, "NGNX/USDC": 0.0006201,
  "EURC/JPYC": 169.09,  "JPYC/EURC": 0.005914,
  "GBPT/EURC": 1.1735,  "EURC/GBPT": 0.8521,
  "NGNX/USDC": 0.0006201,
};

var explorer = "https://testnet.arcscan.app/tx/";
var tickerPairs = ["USDC/EURC", "EURC/USDC", "USDC/KRW1", "USDC/JPYC", "USDC/GBPT", "USDC/BRZ", "USDC/MXNB", "USDC/SGDX", "USDC/NGNX", "EURC/JPYC", "GBPT/EURC", "NGNX/USDC"];

// ─── Helper ───
function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function fmtUsd(n) {
  if (n >= 1000000) return "$" + (n/1000000).toFixed(2) + "M";
  if (n >= 1000) return "$" + (n/1000).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

function fmtRate(n) {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

// ─── Init ───
function init() {
  initTicker();
  initNav();
  initSubpanelTabs();
  renderPoolTable();
  updateStats();
  updateQuote();
  loadContractInfo();

  document.getElementById("inputAmount").addEventListener("input", updateQuote);
  document.getElementById("slippageInput").addEventListener("input", function() {
    document.getElementById("qpSlip").textContent = this.value + "%";
  });
}

// ─── Ticker ───
function initTicker() {
  var html = "";
  for (var r = 0; r < 3; r++) {
    for (var i = 0; i < tickerPairs.length; i++) {
      var p = tickerPairs[i];
      var rate = fxRates[p] || 0;
      var pair = p.replace("/", "/");
      html += '<span class="ticker-item">' + esc(pair) + ' <span class="up">' + fmtRate(rate) + '</span> ▲ 0.00%</span>';
    }
  }
  document.getElementById("tickerInner").innerHTML = html;
}

// ─── Navigation ───
function initNav() {
  document.querySelectorAll("nav a").forEach(function(a) {
    a.addEventListener("click", function() {
      document.querySelectorAll("nav a").forEach(function(x) { x.classList.remove("active"); });
      a.classList.add("active");
      var panel = a.getAttribute("data-panel");
      if (panel === "swap") {
        document.querySelector(".swap-panel").style.display = "block";
        document.querySelector(".info-panel").style.display = "block";
      } else if (panel === "pools") {
        document.querySelector(".swap-panel").style.display = "none";
        document.querySelector(".info-panel").style.display = "block";
        showSubpanel("pools");
      } else if (panel === "stats") {
        window.open("https://app.liquiralabs.online/stats", "_blank");
        document.querySelectorAll("nav a").forEach(function(x) { x.classList.remove("active"); });
        document.querySelector("nav a[data-panel='swap']").classList.add("active");
      }
    });
  });
}

// ─── Subpanel navigation ───
function initSubpanelTabs() {
  document.querySelectorAll(".section-tabs button").forEach(function(b) {
    b.addEventListener("click", function() {
      document.querySelectorAll(".section-tabs button").forEach(function(x) { x.classList.remove("active"); });
      b.classList.add("active");
      showSubpanel(b.getAttribute("data-subpanel"));
    });
  });
}

function showSubpanel(name) {
  document.querySelectorAll(".panel").forEach(function(p) { p.classList.remove("active"); });
  var el = document.getElementById("sub" + name.charAt(0).toUpperCase() + name.slice(1));
  if (el) el.classList.add("active");
}

// ─── Token Modal ───
function openTokenModal(mode) {
  tokenModalMode = mode;
  var list = document.getElementById("tokenList");
  list.innerHTML = "";
  for (var i = 0; i < TOKENS.length; i++) {
    var t = TOKENS[i];
    var div = document.createElement("div");
    div.className = "token-option";
    div.innerHTML = '<span class="token-icon ' + t.cls + '">' + esc(t.icon) + '</span><div><div class="symbol">' + esc(t.symbol) + '</div><div class="name">' + esc(t.name) + '</div></div>';
    div.onclick = function(tok) { return function() { selectToken(tok); }; }(t);
    list.appendChild(div);
  }
  document.getElementById("tokenModal").classList.add("show");
  document.getElementById("tokenModal").onclick = function(e) {
    if (e.target === this) this.classList.remove("show");
  };
}

function selectToken(token) {
  if (tokenModalMode === "from") {
    if (token.symbol === selectedTo.symbol) { alert("Cannot swap same token."); return; }
    selectedFrom = token;
    document.getElementById("tokenFromLabel").textContent = token.symbol;
    document.getElementById("btnTokenFrom").querySelector(".token-icon").className = "token-icon " + token.cls;
    document.getElementById("btnTokenFrom").querySelector(".token-icon").textContent = token.icon;
  } else {
    if (token.symbol === selectedFrom.symbol) { alert("Cannot swap same token."); return; }
    selectedTo = token;
    document.getElementById("tokenToLabel").textContent = token.symbol;
    document.getElementById("btnTokenTo").querySelector(".token-icon").className = "token-icon " + token.cls;
    document.getElementById("btnTokenTo").querySelector(".token-icon").textContent = token.icon;
  }
  document.getElementById("tokenModal").classList.remove("show");
  updateQuote();
}

function swapTokens() {
  var tmp = selectedFrom; selectedFrom = selectedTo; selectedTo = tmp;
  document.getElementById("tokenFromLabel").textContent = selectedFrom.symbol;
  document.getElementById("tokenToLabel").textContent = selectedTo.symbol;
  document.getElementById("btnTokenFrom").querySelector(".token-icon").className = "token-icon " + selectedFrom.cls;
  document.getElementById("btnTokenFrom").querySelector(".token-icon").textContent = selectedFrom.icon;
  document.getElementById("btnTokenTo").querySelector(".token-icon").className = "token-icon " + selectedTo.cls;
  document.getElementById("btnTokenTo").querySelector(".token-icon").textContent = selectedTo.icon;
  updateQuote();
}

function setPercent(pct) {
  // In a real app, this would use wallet balance
  document.getElementById("inputAmount").value = (pct === 100) ? "10000" : String(10000 * pct / 100);
  updateQuote();
}

// ─── Quote ───
function getRate(fromSym, toSym) {
  // Look up direct rate, or compute via USDC
  var key = fromSym + "/" + toSym;
  if (fxRates[key]) return fxRates[key];
  // via USDC
  var r1 = fxRates[fromSym + "/USDC"];
  var r2 = fxRates["USDC/" + toSym];
  if (r1 && r2) return r2 / r1;
  return null;
}

function updateQuote() {
  var amtStr = document.getElementById("inputAmount").value;
  var amt = parseFloat(amtStr) || 0;
  var rate = getRate(selectedFrom.symbol, selectedTo.symbol);
  var out = amt * (rate || 1);
  var fee = out * 0.0004; // 0.04% fee

  document.getElementById("rateDisplay").textContent = "1 " + selectedFrom.symbol + " = " + fmtRate(rate || 1) + " " + selectedTo.symbol;
  document.getElementById("outputAmount").value = amt > 0 ? out.toFixed(6) : "";

  document.getElementById("qpRate").textContent = "1 " + selectedFrom.symbol + " = " + fmtRate(rate || 1) + " " + selectedTo.symbol;
  document.getElementById("qpFee").textContent = fmtUsd(fee);
  document.getElementById("qpOutput").textContent = amt > 0 ? (out - fee).toFixed(6) + " " + selectedTo.symbol : "—";
  document.getElementById("qpRoute").textContent = selectedFrom.symbol + " → " + selectedTo.symbol;
}

// ─── Pool Table ───
function renderPoolTable() {
  var body = document.getElementById("poolTableBody");
  var html = "";
  for (var i = 0; i < mockPools.length; i++) {
    var p = mockPools[i];
    var t0 = p.token0, t1 = p.token1;
    html += '<tr onclick="selectPool(' + i + ')">';
    html += '<td><div class="pool-pair"><div class="icons"><span class="token-icon ' + t0.cls + '">' + esc(t0.icon) + '</span><span class="token-icon ' + t1.cls + '">' + esc(t1.icon) + '</span></div><span class="name">' + esc(p.pair) + '</span></div></td>';
    html += '<td>' + fmtUsd(p.tvl) + '</td>';
    html += '<td>' + fmtUsd(p.vol24h) + '</td>';
    html += '<td><span class="badge fee">' + p.fee + ' bps</span></td>';
    html += '<td><span class="trend-up">' + p.apr.toFixed(1) + '%</span></td>';
    html += '<td>' + p.util + '%</td>';
    html += '</tr>';
  }
  body.innerHTML = html;
}

var selectedPoolIdx = -1;

function selectPool(idx) {
  selectedPoolIdx = idx;
  var p = mockPools[idx];
  var lpEl = document.getElementById("lpContent");
  if (!lpEl) return;
  lpEl.innerHTML = `
    <div style="font-size:0.85rem;font-weight:500;margin-bottom:8px;">
      <span class="token-icon ${p.token0.cls}" style="display:inline-flex;width:18px;height:18px;font-size:0.5rem;">${esc(p.token0.icon)}</span>
      ${esc(p.pair)} Pool
    </div>
    <div class="tiny-stat" style="font-size:0.72rem;color:var(--muted);margin-bottom:8px;">
      TVL: ${fmtUsd(p.tvl)} · Fee: ${p.fee} bps · APR: ${p.apr.toFixed(1)}%
    </div>
    <div class="swap-input-group">
      <label>Deposit USDC</label>
      <div class="swap-input-row">
        <input id="lpAmount" type="number" value="1000" min="1" />
        <span class="token-select" style="cursor:default;"><span class="token-icon usdc" style="width:18px;height:18px;font-size:0.5rem;">u</span> USDC</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px;">
      <button class="btn-swap" style="width:auto;padding:8px 20px;font-size:0.8rem;margin-top:0;" onclick="doAddLP(${idx})">Add Liquidity</button>
      ${userAddress ? '<button class="btn-swap" style="width:auto;padding:8px 20px;font-size:0.8rem;margin-top:0;background:linear-gradient(135deg,#ef4444,#dc2626);" onclick="doRemoveLP()">Remove LP</button>' : ''}
    </div>
  `;
  document.getElementById("lpSection").scrollIntoView({ behavior: "smooth" });
}

function scrollToLP() {
  document.getElementById("lpSection").scrollIntoView({ behavior: "smooth" });
}

// ─── Stats ───
function updateStats() {
  var totalTvl = 0, totalVol = 0;
  for (var i = 0; i < mockPools.length; i++) {
    totalTvl += mockPools[i].tvl;
    totalVol += mockPools[i].vol24h;
  }
  document.getElementById("statTvl").textContent = fmtUsd(totalTvl);
  document.getElementById("statVol").textContent = fmtUsd(totalVol);
  document.getElementById("statSlip").textContent = "0.72 bps";
  document.getElementById("statPairs").textContent = mockPools.length + " pairs";
}

// ─── Wallet Connect ───
document.getElementById("btnConnect").onclick = function() {
  var w = null, wn = "Wallet";
  if (window.ethereum) {
    if (window.ethereum.isMetaMask) wn = "MetaMask";
    else if (window.ethereum.isOKXWallet) wn = "OKX";
    w = window.ethereum;
  } else if (window.okxwallet) { w = window.okxwallet; wn = "OKX"; }
  if (!w) { alert("No wallet found. Install MetaMask or OKX Wallet."); return; }

  provider = new ethers.BrowserProvider(w, "any");
  provider.getSigner().then(function(s) {
    signer = s;
    return signer.getAddress();
  }).then(function(addr) {
    userAddress = addr;
    document.getElementById("btnConnect").textContent = addr.slice(0,6) + "..." + addr.slice(-4);
    document.getElementById("walletStatus").textContent = wn + " · Connected";
    document.getElementById("btnSwap").textContent = "Swap";
    document.getElementById("btnSwap").disabled = false;

    if (CONTRACT_ABI.length) {
      contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    }

    // Switch to Arc
    return provider.send("wallet_switchEthereumChain", [{ chainId: "0x" + ARC.chainId.toString(16) }]).catch(function(e) {
      if (e.code === 4902) {
        return provider.send("wallet_addEthereumChain", [{
          chainId: "0x" + ARC.chainId.toString(16), chainName: "Arc Testnet",
          rpcUrls: [ARC.rpc], nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 }
        }]);
      }
    });
  }).then(function() {
    updateMyPositions();
  }).catch(function(e) {
    alert("Connect failed: " + e.message);
  });
};

// ─── Contract ───
function loadContractInfo() {
  fetch("contract-info.json").then(function(r) { return r.json(); }).then(function(info) {
    CONTRACT_ADDRESS = info.contract;
    CONTRACT_ABI = info.abi;
    if (signer) contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  }).catch(function() {
    // No contract deployed yet, using mock mode
    console.log("No contract-info.json found — running in mock mode");
  });
}

// ─── Swap ───
function doSwap() {
  if (!userAddress) { alert("Connect wallet first."); return; }
  var amtStr = document.getElementById("inputAmount").value;
  var amt = parseFloat(amtStr) || 0;
  if (amt <= 0) { alert("Enter an amount."); return; }

  if (contract && CONTRACT_ADDRESS) {
    // On-chain swap via contract
    var tokenIn = selectedFrom.address;
    var amountIn = ethers.parseUnits(amtStr, selectedFrom.decimals);
    var slipPct = parseFloat(document.getElementById("slippageInput").value) / 100;
    var rate = getRate(selectedFrom.symbol, selectedTo.symbol) || 1;
    var expectedOut = amt * rate * (1 - 0.0004);
    var minOut = ethers.parseUnits(String(expectedOut * (1 - slipPct)), selectedTo.decimals);

    // Need pool ID lookup
    var poolId = selectedTo.symbol === "EURC" ? 1 : 2; // simplified

    // Approve first
    var erc20 = new ethers.Contract(tokenIn, ["function approve(address,uint256) returns (bool)"], signer);
    addTx("Approve " + selectedFrom.symbol, erc20.approve(CONTRACT_ADDRESS, amountIn));
    addTx("Swap " + amtStr + " " + selectedFrom.symbol + " → " + selectedTo.symbol,
      erc20.approve(CONTRACT_ADDRESS, amountIn).then(function() { return contract.swap(poolId, tokenIn, amountIn, minOut); })
    );
  } else {
    // Simulated swap
    var rate = getRate(selectedFrom.symbol, selectedTo.symbol) || 1;
    var out = amt * rate;
    var txHash = "0x" + Array.from({length: 40}, function() { return Math.floor(Math.random()*16).toString(16); }).join("") + "..." ;
    addTx("Swap " + amtStr + " " + selectedFrom.symbol + " → " + selectedTo.symbol, Promise.resolve({hash: txHash, wait: function() {
      return new Promise(function(r) { setTimeout(r, 1500); });
    }}));
  }
}

// ─── LP ───
function doAddLP(idx) {
  if (!userAddress) { alert("Connect wallet first."); return; }
  var amtEl = document.getElementById("lpAmount");
  var amt = parseFloat(amtEl ? amtEl.value : "1000") || 0;
  if (amt <= 0) { alert("Enter amount."); return; }

  if (contract && CONTRACT_ADDRESS) {
    var amountIn = ethers.parseUnits(String(amt), 6);
    var erc20 = new ethers.Contract(TOKENS[0].address, ["function approve(address,uint256) returns (bool)"], signer);
    addTx("Approve USDC", erc20.approve(CONTRACT_ADDRESS, amountIn));
    addTx("Add LP " + fmtUsd(amt) + " to " + mockPools[idx].pair,
      erc20.approve(CONTRACT_ADDRESS, amountIn).then(function() { return contract.addLiquidity(idx + 1, amountIn, amountIn, 0); })
    );
  } else {
    var txHash = "0x" + Array.from({length: 40}, function() { return Math.floor(Math.random()*16).toString(16); }).join("") + "...";
    addTx("Add LP " + fmtUsd(amt) + " to " + mockPools[idx].pair, Promise.resolve({hash: txHash, wait: function() {
      return new Promise(function(r) { setTimeout(r, 1500); });
    }}));
  }
}

function doRemoveLP() {
  if (!userAddress) return;
  var txHash = "0x" + Array.from({length: 40}, function() { return Math.floor(Math.random()*16).toString(16); }).join("");
  addTx("Remove LP from " + (selectedPoolIdx >= 0 ? mockPools[selectedPoolIdx].pair : "pool"), Promise.resolve({hash: txHash, wait: function() {
    return new Promise(function(r) { setTimeout(r, 1500); });
  }}));
}

// ─── My Positions (mock) ───
function updateMyPositions() {
  var el = document.getElementById("myPosContent");
  if (!userAddress) {
    el.innerHTML = '<p style="color:var(--muted);font-size:0.8rem;">Connect wallet to see LP positions.</p>';
    return;
  }
  el.innerHTML = '<p style="color:var(--muted);font-size:0.8rem;">No active LP positions. Select a pool to add liquidity.</p>';
}

// ─── TX Log ───
function addTx(action, txPromise) {
  var logEl = document.getElementById("txLog");
  if (logEl.querySelector(".muted")) { logEl.innerHTML = ""; }
  txIdCounter++;
  var txId = txIdCounter;
  var row = document.createElement("div");
  row.className = "tx-row";
  row.id = "txRow_" + txId;
  row.innerHTML = '<span class="tx-time">[' + new Date().toLocaleTimeString() + ']</span> ' + esc(action) + ' - <span class="tx-pending">pending...</span>';
  logEl.appendChild(row);
  logEl.scrollTop = logEl.scrollHeight;

  // Also add to Activity panel
  var subLog = document.querySelector("#subTxlog #txLog");
  if (subLog && subLog !== logEl) {
    var r2 = row.cloneNode(true);
    r2.id = "txRow2_" + txId;
    if (subLog.querySelector(".muted")) subLog.innerHTML = "";
    subLog.appendChild(r2);
  }

  txPromise.then(function(tx) {
    var el = document.getElementById("txRow_" + txId);
    if (el) {
      el.innerHTML = '<span class="tx-time">[' + new Date().toLocaleTimeString() + ']</span> ' + esc(action) + ' - <a class="tx-link" href="' + ARC.explorer + tx.hash + '" target="_blank">' + tx.hash.slice(0,12) + '...</a> <span class="tx-pending">confirming...</span>';
    }
    logEl.scrollTop = logEl.scrollHeight;
    return tx.wait();
  }).then(function() {
    [document.getElementById("txRow_" + txId), document.getElementById("txRow2_" + txId)].forEach(function(el) {
      if (el) { el.innerHTML = el.innerHTML.replace('confirming...', '<span class="tx-ok">confirmed</span>'); el.className = "tx-row tx-ok"; }
    });
  }).catch(function(e) {
    [document.getElementById("txRow_" + txId), document.getElementById("txRow2_" + txId)].forEach(function(el) {
      if (el) {
        el.innerHTML = el.innerHTML.replace(/pending...|confirming.../, '<span class="tx-fail">failed</span>');
        el.className = "tx-row tx-fail";
        el.innerHTML += " (" + esc(e.message ? e.message.slice(0,40) : "rejected") + ")";
      }
    });
  });
  return txPromise;
}

// ─── Start ───
document.addEventListener("DOMContentLoaded", init);
