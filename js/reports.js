/* ============================================================
   REPORTS.JS - Relatorios, tabela e graficos
   ============================================================ */

let accessBarChartInstance = null;
let accessLineChartInstance = null;
let flowBarChartInstance = null;
let flowLineChartInstance = null;
let accessHistoryPage = 1;
let totalAccessPage = 1;

function renderReports() {
    const container = document.getElementById('reports-container');
    if (!container) return;

    const doorOptions = AppData.doors.map(door =>
        `<option value="${door.id}">${door.name}</option>`
    ).join('');

    container.innerHTML = `
        <div class="reports-toolbar">
            <label>
                <i class="fas fa-door-open"></i>
                Filtrar por Porta:
                <select class="filter-select" id="report-door-filter" onchange="loadReportData(true)">
                    ${doorOptions}
                </select>
            </label>
        </div>

        <div class="reports-grid">
            <div class="report-card report-highlight-card">
                <p class="report-card-title"><i class="fas fa-users"></i> Pessoas no Acesso Atual</p>
                <div class="report-highlight-value" id="current-occupancy-value">0</div>
            </div>

            <div class="report-card">
                <div class="report-header-inline">
                    <p class="report-card-title"><i class="fas fa-list-alt"></i> Historico de Acessos</p>
                    <div class="report-pagination" id="access-history-pagination"></div>
                </div>
                <div class="report-table-wrapper">
                    <table class="data-table" id="report-table">
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Horario Abertura</th>
                                <th>Horario Fechamento</th>
                                <th>Qtd. Entrada</th>
                                <th>Qtd. Saida</th>
                            </tr>
                        </thead>
                        <tbody id="report-tbody"></tbody>
                    </table>
                </div>
            </div>

            <div class="charts-row">
                <div class="report-card">
                    <p class="report-card-title"><i class="fas fa-chart-bar"></i> Acessos Mensais</p>
                    <div class="chart-wrap">
                        <canvas id="chart-bar"></canvas>
                    </div>
                </div>
                <div class="report-card">
                    <p class="report-card-title"><i class="fas fa-chart-line"></i> Acessos por Horario (Hoje)</p>
                    <div class="chart-wrap">
                        <canvas id="chart-line"></canvas>
                    </div>
                </div>
            </div>

            <div class="charts-row">
                <div class="report-card">
                    <p class="report-card-title"><i class="fas fa-chart-bar"></i> Entradas Mensais por Fluxo</p>
                    <div class="chart-wrap">
                        <canvas id="chart-flow-bar"></canvas>
                    </div>
                </div>
                <div class="report-card">
                    <p class="report-card-title"><i class="fas fa-chart-line"></i> Entradas por Horario via Fluxo (Hoje)</p>
                    <div class="chart-wrap">
                        <canvas id="chart-flow-line"></canvas>
                    </div>
                </div>
            </div>

    
        </div>
    `;

    accessHistoryPage = 1;
    totalAccessPage = 1;
    loadReportData(true);
}

function loadReportData(resetPage = false) {
    const select = document.getElementById('report-door-filter');
    if (!select) return;

    const doorId = parseInt(select.value, 10);
    if (Number.isNaN(doorId)) return;

    if (resetPage) {
        accessHistoryPage = 1;
        totalAccessPage = 1;
    }

    renderAccessTable(doorId);
    renderCurrentOccupancy(doorId);
    renderBarChart(doorId);
    renderLineChart(doorId);
    renderFlowBarChart(doorId);
    renderFlowLineChart(doorId);
}

function renderCurrentOccupancy(doorId) {
    const valueElement = document.getElementById('current-occupancy-value');
    if (!valueElement) return;

    valueElement.textContent = String(AppData.getCurrentAccessOccupancy(doorId));
}

function renderAccessTable(doorId) {
    const tbody = document.getElementById('report-tbody');
    const pagination = document.getElementById('access-history-pagination');
    const pageData = AppData.getPaginatedAccessLogsByDoor(doorId, accessHistoryPage, 5);
    const logs = pageData.items;

    accessHistoryPage = pageData.page;

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-table">Nenhum acesso registrado</td></tr>';
        if (pagination) pagination.innerHTML = '';
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const user = AppData.getUserById(log.userId);
        const userName = user ? user.name : log.userId;
        const openTimeLabel = log.time ? new Date(log.time).toLocaleString('pt-BR') : '-';
        const closeTimeLabel = log.closeTime ? new Date(log.closeTime).toLocaleString('pt-BR') : '-';
        const qtdEntrada = log.totalAccess?.qtdEntrada ?? 0;
        const qtdSaida = log.totalAccess?.qtdSaida ?? 0;

        return `
            <tr>
                <td>${userName}</td>
                <td>${openTimeLabel}</td>
                <td>${closeTimeLabel}</td>
                <td>${qtdEntrada}</td>
                <td>${qtdSaida}</td>
            </tr>
        `;
    }).join('');

    if (pagination) {
        const pageItems = buildPaginationItems(pageData.page, pageData.totalPages, 5);
        pagination.innerHTML = `
            <button class="pagination-btn" onclick="changeAccessHistoryPage(-1)" ${pageData.page <= 1 ? 'disabled' : ''}>
                Anterior
            </button>
            ${pageItems.map(pageNumber => `
                <button
                    class="pagination-btn ${pageNumber === pageData.page ? 'active' : ''}"
                    onclick="goToAccessHistoryPage(${pageNumber})"
                    ${pageNumber === pageData.page ? 'disabled' : ''}
                >
                    ${pageNumber}
                </button>
            `).join('')}
            <button class="pagination-btn" onclick="changeAccessHistoryPage(1)" ${pageData.page >= pageData.totalPages ? 'disabled' : ''}>
                Proxima
            </button>
        `;
    }
}

function renderBarChart(doorId) {
    if (accessBarChartInstance) accessBarChartInstance.destroy();

    const ctx = document.getElementById('chart-bar').getContext('2d');
    const monthlyData = AppData.getMonthlyAccessData(doorId);
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const chartData = getResponsiveMonthlyChartData(monthlyData, months);

    accessBarChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Acessos',
                data: chartData.values,
                backgroundColor: 'rgba(0, 0, 200, 0.6)',
                borderColor: '#0000ff',
                borderWidth: 1,
                borderRadius: 5,
            }],
        },
        options: getChartOptions(),
    });
}

function renderLineChart(doorId) {
    if (accessLineChartInstance) accessLineChartInstance.destroy();

    const ctx = document.getElementById('chart-line').getContext('2d');
    const hourlyData = AppData.getHourlyAccessData(doorId);
    const chartData = getResponsiveHourlyChartData(hourlyData);

    accessLineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Acessos',
                data: chartData.values,
                borderColor: '#0000ff',
                backgroundColor: 'rgba(0,0,255,0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 3,
            }],
        },
        options: getLineChartOptions(),
    });
}

function renderFlowBarChart(doorId) {
    if (flowBarChartInstance) flowBarChartInstance.destroy();

    const ctx = document.getElementById('chart-flow-bar').getContext('2d');
    const monthlyData = AppData.getMonthlyFlowAccessData(doorId, { onlyEntries: true });
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const chartData = getResponsiveMonthlyChartData(monthlyData, months);

    flowBarChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Entradas',
                data: chartData.values,
                backgroundColor: 'rgba(46, 204, 113, 0.55)',
                borderColor: '#2ecc71',
                borderWidth: 1,
                borderRadius: 5,
            }],
        },
        options: getChartOptions(),
    });
}

function renderFlowLineChart(doorId) {
    if (flowLineChartInstance) flowLineChartInstance.destroy();

    const ctx = document.getElementById('chart-flow-line').getContext('2d');
    const entriesData = getResponsiveHourlyChartData(
        AppData.getHourlyFlowAccessData(doorId, { statusCode: 1 })
    );
    const exitsData = getResponsiveHourlyChartData(
        AppData.getHourlyFlowAccessData(doorId, { statusCode: 0 })
    );

    flowLineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: entriesData.labels,
            datasets: [
                {
                    label: 'Entradas',
                    data: entriesData.values,
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.12)',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                },
                {
                    label: 'Saidas',
                    data: exitsData.values,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 3,
                },
            ],
        },
        options: getLineChartOptions({ showLegend: true }),
    });
}

function changeAccessHistoryPage(offset) {
    accessHistoryPage += offset;
    loadReportData();
}

function goToAccessHistoryPage(page) {
    accessHistoryPage = page;
    loadReportData();
}

function changeTotalAccessPage(offset) {
    totalAccessPage += offset;
    loadReportData();
}

function buildHourLabels() {
    return Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, '0')}h`);
}

function isMobileCharts() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function getResponsiveMonthlyChartData(values, labels) {
    if (!isMobileCharts()) {
        return { values, labels };
    }

    const now = new Date();
    const items = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
        return {
            label: labels[date.getMonth()],
            value: values[date.getMonth()],
        };
    });

    return {
        labels: items.map(item => item.label),
        values: items.map(item => item.value),
    };
}

function getResponsiveHourlyChartData(values) {
    if (!isMobileCharts()) {
        return {
            labels: buildHourLabels(),
            values,
        };
    }

    const labels = ['00h', '04h', '08h', '12h', '16h', '20h'];
    const groupedValues = [];

    for (let index = 0; index < 24; index += 4) {
        const total = values.slice(index, index + 4).reduce((sum, value) => sum + value, 0);
        groupedValues.push(total);
    }

    return {
        labels,
        values: groupedValues,
    };
}

function buildPaginationItems(currentPage, totalPages, maxItems = 5) {
    const visibleItems = Math.min(maxItems, totalPages);
    const half = Math.floor(visibleItems / 2);
    let start = Math.max(1, currentPage - half);
    let end = start + visibleItems - 1;

    if (end > totalPages) {
        end = totalPages;
        start = Math.max(1, end - visibleItems + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function getChartOptions() {
    return {
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
        },
        scales: {
            x: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
    };
}

function getLineChartOptions(options = {}) {
    const showLegend = Boolean(options.showLegend);

    return {
        maintainAspectRatio: false,
        plugins: {
            legend: { display: showLegend, labels: { color: '#888' } },
        },
        scales: {
            x: { ticks: { color: '#888', maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
    };
}
