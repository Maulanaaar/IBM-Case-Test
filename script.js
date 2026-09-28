/* =========================================================
   Student Attendance Analytics Dashboard — script.js
   =========================================================
   Data: Attendance_Prediction.csv
   Columns:
     student_id, age, gender, course, year, parent_education,
     internet_access, hostel_resident, class_type, weather,
     study_hours, sleep_hours, travel_time_minutes, attendance,
     absence_reason
   attendance mapping: 1 = Hadir, 0 = Tidak Hadir
   ========================================================= */

/* ---- State ---- */
const CSV_PATH = 'Attendance_Prediction.csv';
let allRecords = [];        // Raw loaded records (unchanged)
let filteredRecords = [];   // Currently filtered view
let tableRecords = [];      // After search, for pagination & table
let currentPage = 1;
const PAGE_SIZE = 25;
let sortCol = null;
let sortDir = 'asc';
let chartInstances = {};    // Keyed by canvas id

/* ---- Column display names (Bahasa Indonesia) ---- */
const COL_LABELS = {
  student_id:            'ID Mahasiswa',
  age:                   'Usia',
  gender:                'Gender',
  course:                'Program Studi',
  year:                  'Tahun',
  parent_education:      'Pendidikan Ortu',
  internet_access:       'Akses Internet',
  hostel_resident:       'Kos/Asrama',
  class_type:            'Jenis Kelas',
  weather:               'Cuaca',
  study_hours:           'Jam Belajar',
  sleep_hours:           'Jam Tidur',
  travel_time_minutes:   'Waktu Perjalanan (min)',
  attendance:            'Kehadiran',
  absence_reason:        'Alasan Absen',
};

const COLUMNS_ORDER = [
  'student_id','age','gender','course','year','parent_education',
  'internet_access','hostel_resident','class_type','weather',
  'study_hours','sleep_hours','travel_time_minutes','attendance','absence_reason'
];

/* ============================================================
   CHART COLORS
   ============================================================ */
const CHART_COLORS = [
  '#1d4ed8','#16a34a','#dc2626','#d97706','#7c3aed',
  '#0891b2','#be185d','#65a30d','#ea580c','#4f46e5',
  '#0d9488','#c026d3','#b45309','#059669','#db2777'
];

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadCSV();
  document.getElementById('btnReload').addEventListener('click', loadCSV);
  document.getElementById('btnRetry').addEventListener('click', loadCSV);
  document.getElementById('btnResetFilter').addEventListener('click', resetFilters);
  document.getElementById('btnExport').addEventListener('click', exportCSV);
  document.getElementById('searchInput').addEventListener('input', onSearchChange);
  ['filterCourse','filterYear','filterClassType','filterGender',
   'filterWeather','filterAttendance'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
});

/* ============================================================
   CSV LOADING
   ============================================================ */
function loadCSV() {
  showLoading(true);
  setStatus('loading', '⏳ Memuat data...');

  Papa.parse(CSV_PATH, {
    download: true,
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,  // Keep as string so we handle types manually
    complete(results) {
      if (!results.data || results.data.length === 0) {
        showError('CSV berhasil diunduh tetapi tidak ada data.');
        return;
      }
      allRecords = results.data.map(normalizeRow);
      setStatus('ok', `✅ ${allRecords.length.toLocaleString('id-ID')} catatan dimuat`);
      showLoading(false);
      showMain(true);
      populateFilters();
      buildDataQualityPanel();
      applyFilters();
    },
    error(err) {
      showError(`Tidak dapat memuat ${CSV_PATH}. Pastikan server lokal berjalan dan file berada di direktori yang sama.\n\n${err.message}`);
    }
  });
}

/* ============================================================
   ROW NORMALISATION
   ============================================================ */
function normalizeRow(row) {
  const r = {};
  for (const k in row) {
    r[k.trim()] = (row[k] === undefined || row[k] === null) ? '' : String(row[k]).trim();
  }
  return r;
}

/* ============================================================
   FILTER POPULATION
   ============================================================ */
function getUnique(col) {
  const s = new Set(allRecords.map(r => r[col]).filter(Boolean));
  return [...s].sort();
}

function populateFilters() {
  const map = {
    filterCourse:    'course',
    filterYear:      'year',
    filterClassType: 'class_type',
    filterGender:    'gender',
    filterWeather:   'weather',
  };
  const yearOrder = ['1st year','2nd year','3rd year','4th year'];

  for (const [id, col] of Object.entries(map)) {
    const sel = document.getElementById(id);
    // Clear all options except the first "Semua" option
    while (sel.options.length > 1) sel.remove(1);
    let values = getUnique(col);
    if (col === 'year') {
      values = yearOrder.filter(v => values.includes(v));
    }
    values.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
  }
}

/* ============================================================
   FILTER APPLICATION
   ============================================================ */
function getFilterValues() {
  return {
    course:     document.getElementById('filterCourse').value,
    year:       document.getElementById('filterYear').value,
    class_type: document.getElementById('filterClassType').value,
    gender:     document.getElementById('filterGender').value,
    weather:    document.getElementById('filterWeather').value,
    attendance: document.getElementById('filterAttendance').value,
  };
}

function applyFilters() {
  const f = getFilterValues();
  filteredRecords = allRecords.filter(r => {
    if (f.course     && r.course     !== f.course)     return false;
    if (f.year       && r.year       !== f.year)       return false;
    if (f.class_type && r.class_type !== f.class_type) return false;
    if (f.gender     && r.gender     !== f.gender)     return false;
    if (f.weather    && r.weather    !== f.weather)    return false;
    if (f.attendance && r.attendance !== f.attendance) return false;
    return true;
  });

  // Reset search & page
  document.getElementById('searchInput').value = '';
  currentPage = 1;
  sortCol = null;
  sortDir = 'asc';

  tableRecords = [...filteredRecords];
  updateAll();
}

function resetFilters() {
  ['filterCourse','filterYear','filterClassType','filterGender',
   'filterWeather','filterAttendance'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('searchInput').value = '';
  applyFilters();
}

/* ============================================================
   SEARCH
   ============================================================ */
function onSearchChange() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  currentPage = 1;
  if (!q) {
    tableRecords = [...filteredRecords];
  } else {
    tableRecords = filteredRecords.filter(r =>
      COLUMNS_ORDER.some(c => r[c] && r[c].toLowerCase().includes(q))
    );
  }
  applySortToTableRecords();
  renderTable();
  renderPagination();
  updateFooter();
}

/* ============================================================
   SORT
   ============================================================ */
function onSortClick(col) {
  if (sortCol === col) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortCol = col;
    sortDir = 'asc';
  }
  currentPage = 1;
  applySortToTableRecords();
  renderTable();
  renderPagination();
  updateSortArrows();
}

function applySortToTableRecords() {
  if (!sortCol) return;
  const numericCols = new Set(['age','study_hours','sleep_hours','travel_time_minutes','attendance']);
  tableRecords.sort((a, b) => {
    let va = a[sortCol] ?? '';
    let vb = b[sortCol] ?? '';
    if (numericCols.has(sortCol)) {
      va = parseFloat(va) || 0;
      vb = parseFloat(vb) || 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    }
    va = va.toLowerCase();
    vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

function updateSortArrows() {
  document.querySelectorAll('#tableHead th').forEach(th => {
    th.classList.remove('sorted-asc','sorted-desc');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = '⇅';
  });
  if (sortCol) {
    const th = document.querySelector(`#tableHead th[data-col="${sortCol}"]`);
    if (th) {
      th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = sortDir === 'asc' ? '↑' : '↓';
    }
  }
}

/* ============================================================
   UPDATE ALL (called after filter/reload)
   ============================================================ */
function updateAll() {
  updateKPIs();
  updateCharts();
  updateInsights();
  buildTableHeaders();
  renderTable();
  renderPagination();
  updateFooter();
}

/* ============================================================
   KPI CARDS
   ============================================================ */
function updateKPIs() {
  const data = filteredRecords;
  const n = data.length;
  const hadir = data.filter(r => r.attendance === '1').length;
  const tidakHadir = data.filter(r => r.attendance === '0').length;
  const rate = n > 0 ? ((hadir / n) * 100).toFixed(1) : '–';

  const studyVals = data.map(r => parseFloat(r.study_hours)).filter(v => !isNaN(v));
  const sleepVals = data.map(r => parseFloat(r.sleep_hours)).filter(v => !isNaN(v));
  const travelVals = data.map(r => parseFloat(r.travel_time_minutes)).filter(v => !isNaN(v));

  setText('kpiTotal',       n.toLocaleString('id-ID'));
  setText('kpiHadir',       hadir.toLocaleString('id-ID'));
  setText('kpiTidakHadir',  tidakHadir.toLocaleString('id-ID'));
  setText('kpiRate',        n > 0 ? `${rate}%` : '–');
  setText('kpiStudy',       studyVals.length ? avg(studyVals).toFixed(2) + ' jam' : '–');
  setText('kpiSleep',       sleepVals.length ? avg(sleepVals).toFixed(2) + ' jam' : '–');
  setText('kpiTravel',      travelVals.length ? avg(travelVals).toFixed(1) + ' mnt' : '–');
}

/* ============================================================
   CHARTS
   ============================================================ */
function updateCharts() {
  buildChartDist();
  buildChartCourse();
  buildChartYear();
  buildChartClassType();
  buildChartWeather();
  buildChartAbsence();
}

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

/* Chart 1 — Attendance Distribution (Doughnut) */
function buildChartDist() {
  destroyChart('chartDist');
  const data = filteredRecords;
  const hadir = data.filter(r => r.attendance === '1').length;
  const tidakHadir = data.filter(r => r.attendance === '0').length;
  const total = hadir + tidakHadir;

  const ctx = document.getElementById('chartDist');
  chartInstances['chartDist'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [`Hadir (${hadir})`, `Tidak Hadir (${tidakHadir})`],
      datasets: [{
        data: [hadir, tidakHadir],
        backgroundColor: ['#16a34a','#dc2626'],
        borderColor: '#fff',
        borderWidth: 3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.parsed;
              const pct = total ? ((v / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${v.toLocaleString('id-ID')} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/* Chart 2 — Attendance Rate by Course (Horizontal Bar) */
function buildChartCourse() {
  destroyChart('chartCourse');
  const grouped = groupByAttendanceRate(filteredRecords, 'course');
  const sorted = [...grouped.entries()].sort((a,b) => b[1].rate - a[1].rate);
  const labels = sorted.map(([k]) => k);
  const rates  = sorted.map(([, v]) => v.rate.toFixed(1));
  const countH = sorted.map(([, v]) => v.hadir);
  const countT = sorted.map(([, v]) => v.total);

  const ctx = document.getElementById('chartCourse');
  chartInstances['chartCourse'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tingkat Kehadiran (%)',
        data: rates,
        backgroundColor: CHART_COLORS.slice(0, labels.length).map(c => c + 'cc'),
        borderColor:     CHART_COLORS.slice(0, labels.length),
        borderWidth: 1.5,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const i = ctx.dataIndex;
              return ` ${ctx.parsed.x}% — Hadir: ${countH[i].toLocaleString('id-ID')} / ${countT[i].toLocaleString('id-ID')}`;
            }
          }
        }
      },
      scales: {
        x: {
          min: 0, max: 100,
          ticks: { callback: v => v + '%' },
          title: { display: true, text: 'Tingkat Kehadiran (%)', font: { size: 11 } }
        },
        y: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

/* Chart 3 — Attendance by Year (Grouped Bar) */
function buildChartYear() {
  destroyChart('chartYear');
  const yearOrder = ['1st year','2nd year','3rd year','4th year'];
  const grouped = groupByAttendanceCount(filteredRecords, 'year');
  const labels = yearOrder.filter(y => grouped.has(y));
  const hadirData    = labels.map(y => grouped.get(y)?.hadir || 0);
  const absenData    = labels.map(y => grouped.get(y)?.tidak || 0);

  const ctx = document.getElementById('chartYear');
  chartInstances['chartYear'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Hadir',       data: hadirData, backgroundColor: '#16a34acc', borderColor: '#16a34a', borderWidth: 1.5 },
        { label: 'Tidak Hadir', data: absenData,  backgroundColor: '#dc2626cc', borderColor: '#dc2626', borderWidth: 1.5 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const i = items[0].dataIndex;
              const total = hadirData[i] + absenData[i];
              const rate = total ? ((hadirData[i] / total) * 100).toFixed(1) : '–';
              return [`Tingkat kehadiran: ${rate}%`];
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 11 } } },
        y: { title: { display: true, text: 'Jumlah', font: { size: 11 } } }
      }
    }
  });
}

/* Chart 4 — Attendance by Class Type (Grouped Bar) */
function buildChartClassType() {
  destroyChart('chartClassType');
  const grouped = groupByAttendanceCount(filteredRecords, 'class_type');
  const labels = [...grouped.keys()].sort();
  const hadirData = labels.map(k => grouped.get(k)?.hadir || 0);
  const absenData = labels.map(k => grouped.get(k)?.tidak || 0);

  const ctx = document.getElementById('chartClassType');
  chartInstances['chartClassType'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Hadir',       data: hadirData, backgroundColor: '#1d4ed8cc', borderColor: '#1d4ed8', borderWidth: 1.5 },
        { label: 'Tidak Hadir', data: absenData,  backgroundColor: '#dc2626cc', borderColor: '#dc2626', borderWidth: 1.5 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const i = items[0].dataIndex;
              const total = hadirData[i] + absenData[i];
              const rate = total ? ((hadirData[i] / total) * 100).toFixed(1) : '–';
              return [`Tingkat kehadiran: ${rate}%`];
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 11 } } },
        y: { title: { display: true, text: 'Jumlah', font: { size: 11 } } }
      }
    }
  });
}

/* Chart 5 — Attendance Rate by Weather (Bar) */
function buildChartWeather() {
  destroyChart('chartWeather');
  const grouped = groupByAttendanceRate(filteredRecords, 'weather');
  const sorted = [...grouped.entries()].sort((a,b) => b[1].rate - a[1].rate);
  const labels = sorted.map(([k]) => k);
  const rates  = sorted.map(([, v]) => v.rate.toFixed(1));
  const countH = sorted.map(([, v]) => v.hadir);
  const countT = sorted.map(([, v]) => v.total);

  const weatherColors = {
    sunny: '#f59e0b', cloudy: '#6b7280', rainy: '#3b82f6',
    hot: '#ef4444', cold: '#06b6d4'
  };
  const bgColors = labels.map(l => (weatherColors[l] || '#94a3b8') + 'cc');
  const bdColors = labels.map(l => weatherColors[l] || '#94a3b8');

  const ctx = document.getElementById('chartWeather');
  chartInstances['chartWeather'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tingkat Kehadiran (%)',
        data: rates,
        backgroundColor: bgColors,
        borderColor: bdColors,
        borderWidth: 1.5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const i = ctx.dataIndex;
              return ` ${ctx.parsed.y}% — Hadir: ${countH[i].toLocaleString('id-ID')} / ${countT[i].toLocaleString('id-ID')}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { font: { size: 11 } } },
        y: {
          min: 0, max: 100,
          ticks: { callback: v => v + '%' },
          title: { display: true, text: 'Tingkat Kehadiran (%)', font: { size: 11 } }
        }
      }
    }
  });
}

/* Chart 6 — Absence Reasons (Pie, only att=0) */
function buildChartAbsence() {
  destroyChart('chartAbsence');
  const absent = filteredRecords.filter(r => r.attendance === '0');
  const counts = new Map();
  absent.forEach(r => {
    const reason = r.absence_reason || 'tidak diketahui';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  });
  const sorted = [...counts.entries()].sort((a,b) => b[1]-a[1]);
  const labels = sorted.map(([k]) => k);
  const data   = sorted.map(([,v]) => v);
  const total  = data.reduce((s,v) => s+v, 0);

  const ctx = document.getElementById('chartAbsence');
  chartInstances['chartAbsence'] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS.slice(0, labels.length).map(c => c + 'dd'),
        borderColor: '#fff',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.parsed;
              const pct = total ? ((v / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${v.toLocaleString('id-ID')} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/* ============================================================
   INSIGHTS
   ============================================================ */
function updateInsights() {
  const panel = document.getElementById('insightsPanel');
  const data = filteredRecords;
  const insights = [];

  if (data.length === 0) {
    panel.innerHTML = '<div class="insight-card"><div class="insight-text">Tidak ada data untuk dianalisis dengan filter saat ini.</div></div>';
    return;
  }

  const n = data.length;
  const hadir = data.filter(r => r.attendance === '1').length;
  const overallRate = (hadir / n * 100).toFixed(1);

  insights.push({
    type: 'info', label: 'Tingkat Kehadiran Keseluruhan',
    text: `Dari <strong>${n.toLocaleString('id-ID')}</strong> catatan yang difilter, tingkat kehadiran secara keseluruhan adalah <strong>${overallRate}%</strong> (${hadir.toLocaleString('id-ID')} hadir, ${(n-hadir).toLocaleString('id-ID')} tidak hadir).`
  });

  // By course
  const courseRates = groupByAttendanceRate(data, 'course');
  if (courseRates.size > 1) {
    const sorted = [...courseRates.entries()].sort((a,b) => b[1].rate - a[1].rate);
    const [bestCourse, bestV] = sorted[0];
    const [worstCourse, worstV] = sorted[sorted.length - 1];
    insights.push({
      type: 'good', label: 'Program Studi dengan Kehadiran Tertinggi',
      text: `<strong>${bestCourse}</strong> mencatat tingkat kehadiran tertinggi: <strong>${bestV.rate.toFixed(1)}%</strong> (${bestV.hadir.toLocaleString('id-ID')} dari ${bestV.total.toLocaleString('id-ID')} catatan).`
    });
    if (bestCourse !== worstCourse) {
      insights.push({
        type: 'warn', label: 'Program Studi dengan Kehadiran Terendah',
        text: `<strong>${worstCourse}</strong> mencatat tingkat kehadiran terendah: <strong>${worstV.rate.toFixed(1)}%</strong> (${worstV.hadir.toLocaleString('id-ID')} dari ${worstV.total.toLocaleString('id-ID')} catatan).`
      });
    }
  }

  // By class type
  const ctRates = groupByAttendanceRate(data, 'class_type');
  if (ctRates.size >= 2) {
    const arr = [...ctRates.entries()];
    const msg = arr.map(([ct, v]) => `<strong>${ct}</strong>: ${v.rate.toFixed(1)}% (${v.total.toLocaleString('id-ID')} catatan)`).join(' | ');
    insights.push({
      type: 'info', label: 'Kehadiran per Jenis Kelas',
      text: `Perbandingan tingkat kehadiran per jenis kelas: ${msg}.`
    });
  }

  // By weather
  const wRates = groupByAttendanceRate(data, 'weather');
  if (wRates.size > 1) {
    const sorted = [...wRates.entries()].sort((a,b) => b[1].rate - a[1].rate);
    const [bestW, bestWV] = sorted[0];
    const [worstW, worstWV] = sorted[sorted.length-1];
    insights.push({
      type: 'info', label: 'Cuaca dan Kehadiran',
      text: `Kehadiran tertinggi terjadi saat cuaca <strong>${bestW}</strong> (${bestWV.rate.toFixed(1)}%), terendah saat cuaca <strong>${worstW}</strong> (${worstWV.rate.toFixed(1)}%). Catatan: ini adalah pola deskriptif, bukan hubungan kausal.`
    });
  }

  // Study hours comparison (hadir vs tidak)
  const hadirRows   = data.filter(r => r.attendance === '1');
  const tidakRows   = data.filter(r => r.attendance === '0');
  if (hadirRows.length > 10 && tidakRows.length > 10) {
    const avgStudyH = avg(hadirRows.map(r => parseFloat(r.study_hours)).filter(v => !isNaN(v)));
    const avgStudyT = avg(tidakRows.map(r => parseFloat(r.study_hours)).filter(v => !isNaN(v)));
    const avgSleepH = avg(hadirRows.map(r => parseFloat(r.sleep_hours)).filter(v => !isNaN(v)));
    const avgSleepT = avg(tidakRows.map(r => parseFloat(r.sleep_hours)).filter(v => !isNaN(v)));
    insights.push({
      type: 'info', label: 'Rata-rata Jam Belajar & Tidur',
      text: `Mahasiswa <strong>hadir</strong>: rata-rata belajar <strong>${avgStudyH.toFixed(2)} jam</strong>, tidur <strong>${avgSleepH.toFixed(2)} jam</strong>.<br>
             Mahasiswa <strong>tidak hadir</strong>: rata-rata belajar <strong>${avgStudyT.toFixed(2)} jam</strong>, tidur <strong>${avgSleepT.toFixed(2)} jam</strong>.<br>
             <span style="color:var(--muted);font-size:0.8em">Catatan: pola deskriptif saja, bukan hubungan kausal.</span>`
    });
  }

  // Top absence reason
  if (tidakRows.length > 0) {
    const reasonCounts = new Map();
    tidakRows.forEach(r => {
      const reason = r.absence_reason || 'tidak diketahui';
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    });
    const sortedR = [...reasonCounts.entries()].sort((a,b) => b[1]-a[1]);
    const [topReason, topCount] = sortedR[0];
    const pct = ((topCount / tidakRows.length) * 100).toFixed(1);
    insights.push({
      type: 'warn', label: 'Alasan Ketidakhadiran Terbanyak',
      text: `Alasan ketidakhadiran paling sering dicatat adalah <strong>"${topReason}"</strong> (${topCount.toLocaleString('id-ID')} kasus, ${pct}% dari total tidak hadir).`
    });
  }

  // Suspicious: att=0 but reason=none
  const att0None = data.filter(r => r.attendance === '0' && r.absence_reason === 'none').length;
  if (att0None > 0) {
    insights.push({
      type: 'warn', label: 'Catatan Tidak Konsisten',
      text: `Ditemukan <strong>${att0None.toLocaleString('id-ID')}</strong> catatan dengan kehadiran = 0 (<em>tidak hadir</em>) namun alasan absen tercatat "<em>none</em>". Catatan ini memerlukan konfirmasi lebih lanjut.`
    });
  }

  panel.innerHTML = insights.map(i => `
    <div class="insight-card ${i.type}">
      <div class="insight-label">${i.label}</div>
      <div class="insight-text">${i.text}</div>
    </div>
  `).join('');
}

/* ============================================================
   DATA QUALITY PANEL (whole dataset, computed once)
   ============================================================ */
function buildDataQualityPanel() {
  const panel = document.getElementById('dataQualityPanel');
  const data = allRecords;
  const n = data.length;

  // Missing values
  const missingCounts = {};
  COLUMNS_ORDER.forEach(col => {
    missingCounts[col] = data.filter(r => r[col] === '' || r[col] === undefined || r[col] === null).length;
  });
  const totalMissing = Object.values(missingCounts).reduce((a,b) => a+b, 0);

  // Unique student IDs
  const ids = new Set(data.map(r => r.student_id));
  const uniqueIDs = ids.size;
  const duplicateIDCount = n - uniqueIDs;  // extra records beyond unique IDs

  // Suspicious ID values
  const knownSuspectIDs = ['200.99', '19800.01'];
  const suspectIDRows = data.filter(r => knownSuspectIDs.includes(r.student_id)).length;

  // Unexpected attendance values
  const badAtt = data.filter(r => r.attendance !== '0' && r.attendance !== '1').length;

  // Attendance=0 with absence_reason=none
  const att0None = data.filter(r => r.attendance === '0' && r.absence_reason === 'none').length;

  const cards = [
    {
      cls: 'info', title: 'Total Catatan',
      value: n.toLocaleString('id-ID'),
      desc: `Dataset terdiri dari ${n.toLocaleString('id-ID')} baris dan ${COLUMNS_ORDER.length} kolom.`
    },
    {
      cls: totalMissing === 0 ? 'ok' : 'warn',
      title: 'Nilai Kosong (Missing)',
      value: totalMissing.toLocaleString('id-ID'),
      desc: totalMissing === 0
        ? 'Tidak ada nilai kosong ditemukan di seluruh kolom.'
        : Object.entries(missingCounts).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ')
    },
    {
      cls: 'info', title: 'ID Mahasiswa Unik',
      value: uniqueIDs.toLocaleString('id-ID'),
      desc: `${uniqueIDs.toLocaleString('id-ID')} nilai unik dari ${n.toLocaleString('id-ID')} total. Terdapat ${duplicateIDCount.toLocaleString('id-ID')} catatan dengan student_id yang tidak unik (muncul lebih dari satu kali).`
    },
    {
      cls: suspectIDRows > 0 ? 'warn' : 'ok',
      title: 'ID Mahasiswa Mencurigakan',
      value: suspectIDRows.toLocaleString('id-ID'),
      desc: suspectIDRows > 0
        ? `Ditemukan ${suspectIDRows.toLocaleString('id-ID')} baris dengan student_id bernilai decimal tidak biasa (200.99, 19800.01). Perlu dikonfirmasi — data asli tidak diubah.`
        : 'Tidak ditemukan ID mencurigakan.'
    },
    {
      cls: badAtt === 0 ? 'ok' : 'bad',
      title: 'Nilai Kehadiran Tidak Valid',
      value: badAtt.toLocaleString('id-ID'),
      desc: badAtt === 0
        ? 'Semua nilai kolom attendance adalah 0 atau 1 (valid). Pemetaan: 1 = Hadir, 0 = Tidak Hadir.'
        : `${badAtt} baris memiliki nilai attendance di luar 0/1.`
    },
    {
      cls: att0None > 0 ? 'warn' : 'ok',
      title: 'Attendance=0 & Alasan="none"',
      value: att0None.toLocaleString('id-ID'),
      desc: att0None > 0
        ? `${att0None.toLocaleString('id-ID')} catatan memiliki attendance=0 (tidak hadir) tetapi absence_reason="none". Ini tidak konsisten dan perlu dikonfirmasi.`
        : 'Tidak ditemukan inkonsistensi antara nilai kehadiran dan alasan absen.'
    },
    {
      cls: 'info', title: 'Distribusi Kehadiran',
      value: '',
      desc: (() => {
        const hadir = data.filter(r => r.attendance === '1').length;
        const tidak = data.filter(r => r.attendance === '0').length;
        return `Hadir (1): ${hadir.toLocaleString('id-ID')} (${(hadir/n*100).toFixed(1)}%) | Tidak Hadir (0): ${tidak.toLocaleString('id-ID')} (${(tidak/n*100).toFixed(1)}%)`;
      })()
    },
    {
      cls: 'info', title: 'Duplikat Baris Persis',
      value: '–',
      desc: 'Deteksi duplikat baris persis tidak dijalankan secara otomatis (performa). Gunakan ekspor CSV dan analisis di Excel/Python jika diperlukan.'
    },
  ];

  panel.innerHTML = cards.map(c => `
    <div class="dq-card ${c.cls}">
      <div class="dq-title">${c.title}</div>
      ${c.value ? `<div class="dq-value">${c.value}</div>` : ''}
      <div class="dq-desc">${c.desc}</div>
    </div>
  `).join('');
}

/* ============================================================
   TABLE
   ============================================================ */
function buildTableHeaders() {
  const thead = document.getElementById('tableHead');
  if (thead.children.length > 0) return; // already built
  const tr = document.createElement('tr');
  COLUMNS_ORDER.forEach(col => {
    const th = document.createElement('th');
    th.setAttribute('data-col', col);
    th.innerHTML = `${COL_LABELS[col] || col} <span class="sort-arrow">⇅</span>`;
    th.addEventListener('click', () => onSortClick(col));
    tr.appendChild(th);
  });
  thead.appendChild(tr);
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  const emptyState = document.getElementById('emptyState');
  const tableEl = document.getElementById('dataTable');

  const total = tableRecords.length;
  const start = (currentPage - 1) * PAGE_SIZE;
  const end   = Math.min(start + PAGE_SIZE, total);
  const pageData = tableRecords.slice(start, end);

  if (total === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    if (tableEl) tableEl.style.display = 'none';
    setText('tableInfo', 'Tidak ada data ditemukan');
    return;
  }

  emptyState.classList.add('hidden');
  if (tableEl) tableEl.style.display = '';

  tbody.innerHTML = pageData.map(row => {
    const cells = COLUMNS_ORDER.map(col => {
      let val = escapeHtml(row[col] ?? '');
      if (col === 'attendance') {
        if (row[col] === '1') val = `<span class="badge badge-hadir">Hadir</span>`;
        else if (row[col] === '0') val = `<span class="badge badge-tidak">Tidak Hadir</span>`;
      }
      return `<td>${val}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  setText('tableInfo', `Menampilkan ${(start+1).toLocaleString('id-ID')}–${end.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')} catatan`);
  updateSortArrows();
}

function renderPagination() {
  const container = document.getElementById('pagination');
  const total = tableRecords.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const makeBtn = (label, page, disabled, active) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (active ? ' active' : '');
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled && !active) {
      btn.addEventListener('click', () => { currentPage = page; renderTable(); renderPagination(); });
    }
    return btn;
  };

  container.appendChild(makeBtn('‹ Prev', currentPage - 1, currentPage === 1, false));

  // Page window
  let start = Math.max(1, currentPage - 2);
  let end   = Math.min(totalPages, currentPage + 2);
  if (start > 1) { container.appendChild(makeBtn('1', 1, false, false)); if (start > 2) container.appendChild(Object.assign(document.createElement('span'), { textContent: '…', className: 'page-btn', style: 'cursor:default;border:none;background:transparent' })); }
  for (let p = start; p <= end; p++) container.appendChild(makeBtn(p, p, false, p === currentPage));
  if (end < totalPages) { if (end < totalPages - 1) container.appendChild(Object.assign(document.createElement('span'), { textContent: '…', className: 'page-btn', style: 'cursor:default;border:none;background:transparent' })); container.appendChild(makeBtn(totalPages, totalPages, false, false)); }

  container.appendChild(makeBtn('Next ›', currentPage + 1, currentPage === totalPages, false));
}

/* ============================================================
   EXPORT CSV
   ============================================================ */
function exportCSV() {
  const data = tableRecords; // current filtered+searched records
  if (data.length === 0) { alert('Tidak ada data untuk diekspor.'); return; }

  const header = COLUMNS_ORDER.join(',');
  const rows = data.map(row =>
    COLUMNS_ORDER.map(col => {
      const v = String(row[col] ?? '');
      // Quote if contains comma, quote, or newline
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    }).join(',')
  );

  const csvContent = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   FOOTER
   ============================================================ */
function updateFooter() {
  const filtered = filteredRecords.length;
  const total = allRecords.length;
  const searched = tableRecords.length;
  let text = `Menampilkan ${searched.toLocaleString('id-ID')} dari ${filtered.toLocaleString('id-ID')} catatan terfilter (total dataset: ${total.toLocaleString('id-ID')})`;
  setText('footerCount', text);
}

/* ============================================================
   UI HELPERS
   ============================================================ */
function showLoading(on) {
  document.getElementById('loadingOverlay').classList.toggle('hidden', !on);
}

function showMain(on) {
  document.getElementById('mainContent').classList.toggle('hidden', !on);
  document.getElementById('errorPanel').classList.add('hidden');
}

function showError(msg) {
  showLoading(false);
  document.getElementById('mainContent').classList.add('hidden');
  document.getElementById('errorPanel').classList.remove('hidden');
  setText('errorMsg', msg);
  setStatus('error', '⚠️ Gagal memuat');
}

function setStatus(type, msg) {
  const el = document.getElementById('loadStatus');
  el.textContent = msg;
  el.className = 'status-badge status-' + type;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================
   STATS HELPERS
   ============================================================ */
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s,v) => s+v, 0) / arr.length;
}

/** Returns Map<category, {hadir, tidak, total, rate}> */
function groupByAttendanceRate(data, col) {
  const map = new Map();
  data.forEach(r => {
    const key = r[col] || '(kosong)';
    if (!map.has(key)) map.set(key, { hadir: 0, tidak: 0, total: 0, rate: 0 });
    const entry = map.get(key);
    entry.total++;
    if (r.attendance === '1') entry.hadir++;
    else entry.tidak++;
  });
  map.forEach(v => { v.rate = v.total ? (v.hadir / v.total) * 100 : 0; });
  return map;
}

/** Returns Map<category, {hadir, tidak}> */
function groupByAttendanceCount(data, col) {
  const map = new Map();
  data.forEach(r => {
    const key = r[col] || '(kosong)';
    if (!map.has(key)) map.set(key, { hadir: 0, tidak: 0 });
    const entry = map.get(key);
    if (r.attendance === '1') entry.hadir++;
    else entry.tidak++;
  });
  return map;
}
