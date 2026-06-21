/**
 * IT Dashboard Management - Main Application
 * SPA router, page controllers, charts, interactions
 * NO DEMO DATA - All data comes from real API
 */

const App = {
    // ---- State ----
    currentPage: 'dashboard',
    currentDeviceIP: null,
    scanId: null,
    scanInterval: null,
    autoRefreshTimer: null,
    autoRefreshEnabled: true,
    confirmCallback: null,
    devices: [],
    sortColumn: null,
    sortDirection: 'asc',
    charts: {},
    topology: { nodes: [], links: [] },
    dragState: null,
    selectedTopologyNodeId: null,
    selectedTopologyLinkId: null,
    topologyRendered: false,
    topologyCanvasSize: { width: 0, height: 0 },
    topologyAnimationTimer: null,
    topologySaveTimer: null,
    topologyLoadPromise: null,
    topologySeeded: false,
    topologyMapByIp: new Map(),
    topologyLayoutLoaded: false,
    topologyNodeCounter: 0,
    topologyLinkCounter: 0,
    topologyDirty: false,
    topologyStatusTimer: null,
    topologyMode: 'edit',
    topologyMessage: '',
    topologyLastSaveAt: null,
    topologyLastLoadAt: null,
    topologyNodesEl: null,
    topologySvgEl: null,
    topologyWorkspaceEl: null,
    topologyEdgesEl: null,
    topologySelectedTool: 'select',
    topologyTempLinkStart: null,
    topologyTempLinkEnd: null,
    topologyAutoLayout: true,

    // ================================================================
    // INITIALIZATION
    // ================================================================

    init() {
        this.setupRouter();
        this.startClock();
        this.checkSession();
    },

    // ================================================================
    // SESSION & AUTH
    // ================================================================

    async checkSession() {
        const token = localStorage.getItem('auth_token');
        if (token) {
            try {
                await api.checkAuth();
                const userData = localStorage.getItem('user_data');
                if (userData) {
                    const user = JSON.parse(userData);
                    document.getElementById('current-user').textContent = user.username || 'Admin';
                    
                    // Restore sidebar state
                    const mode = user.login_mode || 'standalone';
                    const domain = user.domain || '';
                    const userRole = document.querySelector('.user-role');
                    if (userRole) {
                        userRole.textContent = mode === 'domain'
                            ? `Domain: ${domain}`
                            : 'Quản trị viên (Local)';
                    }
                    
                    const adNav = document.querySelector('a[data-page="ad"]');
                    if (adNav) {
                        adNav.style.display = mode === 'domain' ? '' : 'none';
                    }
                }
                this.showApp();
            } catch (e) {
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    },

    showLogin() {
        document.getElementById('login-page').classList.remove('hidden');
        document.getElementById('app').classList.add('hidden');
        document.getElementById('username').focus();
    },

    showApp() {
        document.getElementById('login-page').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        this.handleRoute();
    },

    // ================================================================
    // LOGIN
    // ================================================================

    setupLoginForm() {
        const form = document.getElementById('login-form');
        if (!form._bound) {
            form._bound = true;
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin();
            });
        }
    },

    async handleLogin() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const loginBtn = document.getElementById('login-btn');
        const loginError = document.getElementById('login-error');
        const domain = document.getElementById('domain')?.value?.trim() || '';
        const mode = currentLoginMode; // 'standalone' or 'domain'

        if (!username || !password) {
            loginError.textContent = 'Vui lòng nhập tên đăng nhập và mật khẩu';
            loginError.classList.remove('hidden');
            return;
        }

        if (mode === 'domain' && !domain) {
            loginError.textContent = 'Vui lòng nhập tên Domain hoặc IP Domain Controller';
            loginError.classList.remove('hidden');
            return;
        }

        loginBtn.classList.add('loading');
        loginError.classList.add('hidden');

        try {
            const data = await api.login(username, password, mode, domain);
            const userData = data.user || { username };
            userData.login_mode = mode;
            userData.domain = domain;
            localStorage.setItem('user_data', JSON.stringify(userData));
            localStorage.setItem('login_mode', mode);
            if (domain) localStorage.setItem('login_domain', domain);

            document.getElementById('current-user').textContent = username;

            // Update sidebar to reflect login mode
            const userRole = document.querySelector('.user-role');
            if (userRole) {
                userRole.textContent = mode === 'domain'
                    ? `Domain: ${domain}`
                    : 'Quản trị viên (Local)';
            }

            // Show/hide AD menu based on mode
            const adNav = document.querySelector('a[data-page="ad"]');
            if (adNav) {
                adNav.style.display = mode === 'domain' ? '' : 'none';
            }

            this.showApp();
            const modeLabel = mode === 'domain' ? `mạng công ty (${domain})` : 'mạng thường (Local)';
            this.toast(`Đăng nhập thành công — ${modeLabel}`, 'success');
        } catch (error) {
            loginError.textContent = error.message || 'Tên đăng nhập hoặc mật khẩu không chính xác';
            loginError.classList.remove('hidden');
        } finally {
            loginBtn.classList.remove('loading');
        }
    },

    async logout() {
        await api.logout();
        localStorage.removeItem('user_data');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('login_mode');
        localStorage.removeItem('login_domain');
        this.stopAutoRefresh();
        // Reset AD nav visibility
        const adNav = document.querySelector('a[data-page="ad"]');
        if (adNav) adNav.style.display = '';
        this.showLogin();
        this.toast('Đã đăng xuất', 'info');
    },

    // ================================================================
    // ROUTER
    // ================================================================

    setupRouter() {
        window.addEventListener('hashchange', () => this.handleRoute());
    },

    handleRoute() {
        const hash = window.location.hash.slice(1) || 'dashboard';
        const page = hash.split('/')[0];
        this.navigateTo(page);
    },

    navigateTo(page) {
        if (window.location.hash.slice(1) !== page) {
            window.location.hash = page;
            return;
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const targetPage = document.getElementById(`page-${page}`);
        if (targetPage) targetPage.classList.add('active');

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        const titles = {
            dashboard: 'Dashboard',
            devices: 'Thiết bị',
            topology: 'Sơ đồ mạng 2D',
            scan: 'Quét mạng',
            remote: 'Remote Control',
            ad: 'Active Directory',
            settings: 'Cài đặt'
        };
        document.getElementById('page-title').textContent = titles[page] || 'Dashboard';

        this.currentPage = page;
        this.loadPageData(page);
    },

    loadPageData(page) {
        switch (page) {
            case 'dashboard': this.loadDashboard(); break;
            case 'devices': this.loadDevices(); break;
            case 'topology': this.loadTopologyPage(); break;
            case 'scan': break;
            case 'remote': this.loadRemoteDevices(); break;
            case 'ad': this.loadADComputers(); break;
            case 'settings': this.loadSettings(); break;
        }
    },

    // ================================================================
    // SIDEBAR
    // ================================================================

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('mobile-open');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    },

    // ================================================================
    // CLOCK
    // ================================================================

    startClock() {
        const update = () => {
            const now = new Date();
            const timeStr = now.toLocaleString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            document.getElementById('server-time').textContent = timeStr;
        };
        update();
        setInterval(update, 1000);
    },

    // ================================================================
    // DASHBOARD
    // ================================================================

    async loadDashboard() {
        this.stopAutoRefresh();
        try {
            await Promise.all([
                this.loadDeviceStats(),
                this.loadCharts(),
                this.loadRecentActivity()
            ]);
        } catch (e) {
            // Dashboard shows empty state if API fails
        }
    },

    async loadDeviceStats() {
        try {
            const data = await api.getDeviceStats();
            // API returns {success: true, stats: {...}} or flat {total, online, offline}
            const stats = data.stats || data;
            this.animateCounter('stat-total', stats.total || 0);
            this.animateCounter('stat-online', stats.online || 0);
            this.animateCounter('stat-offline', stats.offline || 0);
            this.animateCounter('stat-types', Object.keys(stats.by_type || {}).length || 0);
        } catch (e) {
            this.animateCounter('stat-total', 0);
            this.animateCounter('stat-online', 0);
            this.animateCounter('stat-offline', 0);
            this.animateCounter('stat-types', 0);
        }
    },

    animateCounter(elementId, target) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const start = parseInt(el.textContent) || 0;
        const diff = target - start;
        if (diff === 0) { el.textContent = target; return; }
        const duration = 800;
        const startTime = Date.now();
        const update = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(start + diff * eased);
            if (progress < 1) requestAnimationFrame(update);
        };
        requestAnimationFrame(update);
    },

    async loadCharts() {
        let online = 0, offline = 0, typeData = {};
        try {
            const data = await api.getDeviceStats();
            const stats = data.stats || data;
            online = stats.online || 0;
            offline = stats.offline || 0;
            typeData = stats.by_type || {};
        } catch (e) {
            // Empty charts
        }
        this.renderStatusChart(online, offline);
        this.renderTypeChart(typeData);
    },

    renderStatusChart(online, offline) {
        const ctx = document.getElementById('statusChart');
        if (!ctx) return;
        if (this.charts.status) this.charts.status.destroy();

        this.charts.status = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Online', 'Offline'],
                datasets: [{
                    data: [online, offline],
                    backgroundColor: ['rgba(0, 255, 136, 0.8)', 'rgba(248, 81, 73, 0.8)'],
                    borderColor: ['rgba(0, 255, 136, 1)', 'rgba(248, 81, 73, 1)'],
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#8b949e', padding: 20, font: { size: 13 } }
                    }
                }
            }
        });
    },

    renderTypeChart(typeData) {
        const ctx = document.getElementById('typeChart');
        if (!ctx) return;
        if (this.charts.types) this.charts.types.destroy();

        const labels = Object.keys(typeData);
        const values = Object.values(typeData);
        const colors = [
            'rgba(59, 130, 246, 0.8)', 'rgba(168, 85, 247, 0.8)',
            'rgba(57, 210, 192, 0.8)', 'rgba(210, 153, 34, 0.8)',
            'rgba(219, 109, 40, 0.8)', 'rgba(233, 69, 96, 0.8)'
        ];

        this.charts.types = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Chưa có dữ liệu'],
                datasets: [{
                    label: 'Số lượng',
                    data: values.length ? values : [0],
                    backgroundColor: colors.slice(0, labels.length || 1),
                    borderColor: colors.map(c => c.replace('0.8', '1')).slice(0, labels.length || 1),
                    borderWidth: 1,
                    borderRadius: 6,
                    barThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8b949e', font: { size: 12 } }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8b949e', font: { size: 12 }, stepSize: 1 },
                        beginAtZero: true
                    }
                }
            }
        });
    },

    async loadRecentActivity() {
        const tbody = document.getElementById('activity-table-body');
        try {
            const activities = await api.getRecentActivity();
            if (activities && activities.length > 0) {
                tbody.innerHTML = activities.slice(0, 10).map(a => `
                    <tr>
                        <td><span style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px">${this.formatTime(a.time)}</span></td>
                        <td><strong>${a.device_ip || 'N/A'}</strong> ${a.hostname ? `(${a.hostname})` : ''}</td>
                        <td>${a.action}</td>
                        <td>${a.user || 'System'}</td>
                        <td>${this.getStatusBadge(a.status || 'info')}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="fas fa-inbox"></i><p>Chưa có hoạt động nào. Bắt đầu quét mạng để xem thiết bị.</p></td></tr>';
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="fas fa-inbox"></i><p>Không thể tải dữ liệu hoạt động</p></td></tr>';
        }
    },

    getStatusBadge(status) {
        const map = {
            success: '<span class="status-dot online"></span> Thành công',
            error: '<span class="status-dot offline"></span> Lỗi',
            warning: '<span class="status-dot" style="background:var(--yellow-light);box-shadow:0 0 6px var(--yellow-light)"></span> Cảnh báo',
            info: '<span class="status-dot" style="background:var(--blue-light);box-shadow:0 0 6px var(--blue-light)"></span> Thông tin'
        };
        return map[status] || map.info;
    },

    refreshDashboard() {
        this.loadDashboard();
        this.toast('Đã làm mới dữ liệu', 'success');
    },

    // ================================================================
    // DEVICES
    // ================================================================

    async loadDevices() {
        try {
            const data = await api.getDevices();
            // API may return {devices: [...]} or [...]
            this.devices = Array.isArray(data) ? data : (data.devices || data.stats?.devices || []);
        } catch (e) {
            this.devices = [];
        }
        this.renderDeviceTable(this.devices);
        this.startAutoRefresh();
    },

    renderDeviceTable(devices) {
        const tbody = document.getElementById('devices-table-body');
        if (!devices || devices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-inbox"></i><p>Chưa có thiết bị nào. Hãy quét mạng để bắt đầu.</p></td></tr>';
            document.getElementById('device-count').textContent = '0 thiết bị';
            return;
        }

        tbody.innerHTML = devices.map(d => {
            const isOnline = d.reachable || d.status === 'online';
            const status = isOnline ? 'online' : 'offline';
            const mac = d.mac_address || d.mac || 'N/A';
            const hostname = d.hostname || d.ip;
            const type = d.type || 'unknown';
            const user = d.user_login || d.logged_user || '';
            const lastSeen = d.last_seen || d.scan_timestamp || '';

            return `
            <tr onclick="App.openDeviceDetail('${d.ip}')" class="device-row" data-ip="${d.ip}">
                <td><code style="color:var(--cyan)">${d.ip}</code></td>
                <td><strong>${this.escapeHtml(hostname)}</strong></td>
                <td><code style="font-size:11px;color:var(--text-muted)">${this.escapeHtml(mac)}</code></td>
                <td>${status === 'online'
                    ? '<span class="status-dot online"></span>Online'
                    : '<span class="status-dot offline"></span>Offline'
                }</td>
                <td><span class="badge badge-${type}">${this.getDeviceTypeLabel(type)}</span></td>
                <td>${user ? this.escapeHtml(user) : '<span style="color:var(--text-muted)">-</span>'}</td>
                <td><span style="font-size:12px;color:var(--text-muted)">${this.formatTime(lastSeen)}</span></td>
            </tr>`;
        }).join('');

        document.getElementById('device-count').textContent = `${devices.length} thiết bị`;
    },

    getDeviceTypeLabel(type) {
        const map = {
            'windows-pc': 'Workstation',
            'workstation': 'Workstation',
            'windows-server': 'Server',
            'linux-server': 'Linux Server',
            'web-server': 'Web Server',
            'server': 'Server',
            'printer': 'Printer',
            'switch': 'Switch',
            'router': 'Router',
            'access_point': 'Access Point',
            'ftp-server': 'FTP Server',
            'vnc-host': 'VNC Host',
            'device': 'Thiết bị'
        };
        return map[type] || type || 'Khác';
    },

    filterDevices() {
        const search = document.getElementById('device-search').value.toLowerCase();
        const statusFilter = document.getElementById('device-status-filter').value;
        const typeFilter = document.getElementById('device-type-filter').value;

        let filtered = this.devices;

        if (search) {
            filtered = filtered.filter(d =>
                (d.ip && d.ip.includes(search)) ||
                (d.hostname && d.hostname.toLowerCase().includes(search)) ||
                (d.mac_address && d.mac_address.toLowerCase().includes(search)) ||
                (d.mac && d.mac.toLowerCase().includes(search)) ||
                (d.user_login && d.user_login.toLowerCase().includes(search))
            );
        }

        if (statusFilter) {
            filtered = filtered.filter(d => {
                const isOnline = d.reachable || d.status === 'online';
                return statusFilter === 'online' ? isOnline : !isOnline;
            });
        }

        if (typeFilter) {
            filtered = filtered.filter(d => d.type === typeFilter);
        }

        this.renderDeviceTable(filtered);
    },

    sortDevices(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        this.devices.sort((a, b) => {
            let va = a[column] || '';
            let vb = b[column] || '';
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return this.sortDirection === 'asc' ? -1 : 1;
            if (va > vb) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        this.filterDevices();
    },

    startAutoRefresh() {
        this.stopAutoRefresh();
        this.autoRefreshEnabled = document.getElementById('auto-refresh-toggle')?.checked;
        if (this.autoRefreshEnabled) {
            this.autoRefreshTimer = setInterval(() => {
                if (this.currentPage === 'devices') {
                    this.refreshDevicesQuiet();
                }
            }, 30000);
        }
    },

    stopAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }
    },

    toggleAutoRefresh() {
        this.autoRefreshEnabled = document.getElementById('auto-refresh-toggle').checked;
        if (this.autoRefreshEnabled) {
            this.startAutoRefresh();
        } else {
            this.stopAutoRefresh();
        }
    },

    async refreshDevices() {
        await this.loadDevices();
        this.toast('Đã làm mới danh sách thiết bị', 'success');
    },

    async refreshDevicesQuiet() {
        try {
            const data = await api.getDevices();
            this.devices = Array.isArray(data) ? data : (data.devices || []);
            this.filterDevices();
        } catch (e) {
            // Silent fail
        }
    },

    // ================================================================
    // DEVICE DETAIL MODAL
    // ================================================================

    async openDeviceDetail(ip) {
        this.currentDeviceIP = ip;
        const modal = document.getElementById('device-modal');
        modal.classList.remove('hidden');

        document.getElementById('modal-device-title').innerHTML = `<i class="fas fa-server"></i> Chi tiết thiết bị - ${ip}`;
        this.switchDeviceTab('info');

        const infoGrid = document.getElementById('device-info-grid');
        infoGrid.innerHTML = '<div class="loading-spinner"></div><p style="text-align:center;color:var(--text-muted)">Đang tải thông tin...</p>';

        try {
            const device = await api.getDeviceDetails(ip);
            this.renderDeviceInfo(device);
            this.renderDevicePorts(device.detailed_ports || device.open_ports || device.ports || []);
            this.renderDeviceSoftware(device.software || []);
        } catch (e) {
            // Try to render from cached device data
            const cached = this.devices.find(d => d.ip === ip) || { ip };
            this.renderDeviceInfo(cached);
            this.renderDevicePorts(cached.open_ports || []);
            this.renderDeviceSoftware([]);
        }
    },

    renderDeviceInfo(device) {
        const grid = document.getElementById('device-info-grid');
        const isOnline = device.reachable || device.status === 'online';
        const mac = device.mac_address || device.mac || 'N/A';

        grid.innerHTML = `
            <div class="detail-item">
                <label>Địa chỉ IP</label>
                <span>${device.ip || 'N/A'}</span>
            </div>
            <div class="detail-item">
                <label>Hostname</label>
                <span>${this.escapeHtml(device.hostname || 'N/A')}</span>
            </div>
            <div class="detail-item">
                <label>Địa chỉ MAC</label>
                <span>${this.escapeHtml(mac)}</span>
            </div>
            <div class="detail-item">
                <label>Trạng thái</label>
                <span>${isOnline ? '<span class="status-dot online"></span>Online' : '<span class="status-dot offline"></span>Offline'}</span>
            </div>
            <div class="detail-item">
                <label>Loại thiết bị</label>
                <span><span class="badge badge-${device.type || 'unknown'}">${this.getDeviceTypeLabel(device.type)}</span></span>
            </div>
            <div class="detail-item">
                <label>Thời gian phản hồi</label>
                <span>${device.response_time_ms ? device.response_time_ms + 'ms' : 'N/A'}</span>
            </div>
            <div class="detail-item">
                <label>Đăng nhập cuối</label>
                <span>${device.user_login || device.logged_user || 'Không có'}</span>
            </div>
            <div class="detail-item">
                <label>Lần cuối online</label>
                <span>${this.formatTime(device.last_seen || device.scan_timestamp)}</span>
            </div>
            ${device.os ? `<div class="detail-item"><label>Hệ điều hành</label><span>${this.escapeHtml(device.os)}</span></div>` : ''}
            ${device.cpu ? `<div class="detail-item"><label>CPU</label><span>${this.escapeHtml(device.cpu)}</span></div>` : ''}
            ${device.ram ? `<div class="detail-item"><label>RAM</label><span>${this.escapeHtml(device.ram)}</span></div>` : ''}
            ${device.disk ? `<div class="detail-item"><label>Ổ cứng</label><span>${this.escapeHtml(device.disk)}</span></div>` : ''}
            ${device.firewall_status !== undefined ? `<div class="detail-item"><label>Firewall</label><span>${device.firewall_status ? '<span style="color:var(--green-light)">Bật</span>' : '<span style="color:var(--red-light)">Tắt</span>'}</span></div>` : ''}
        `;
    },

    renderDevicePorts(ports) {
        const tbody = document.getElementById('device-ports-body');
        if (!ports || ports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>Không có port nào được mở</p></td></tr>';
            return;
        }
        tbody.innerHTML = ports.map(p => {
            const state = p.state || p.status || 'unknown';
            return `
            <tr>
                <td><code style="color:var(--cyan)">${p.port}</code></td>
                <td>${p.protocol || 'TCP'}</td>
                <td>${state === 'open'
                    ? '<span class="status-dot online"></span>Mở'
                    : state === 'filtered'
                        ? '<span class="status-dot" style="background:var(--yellow-light)"></span>Lọc'
                        : '<span class="status-dot offline"></span>Đóng'
                }</td>
                <td>${p.service || 'N/A'}</td>
            </tr>`;
        }).join('');
    },

    renderDeviceSoftware(software) {
        const tbody = document.getElementById('device-software-body');
        if (!software || software.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>Không tìm thấy phần mềm (cần kết nối WMI)</p></td></tr>';
            return;
        }
        tbody.innerHTML = software.map(s => `
            <tr>
                <td><strong>${this.escapeHtml(s.name)}</strong></td>
                <td>${this.escapeHtml(s.version || 'N/A')}</td>
                <td>${this.escapeHtml(s.publisher || 'N/A')}</td>
                <td>${s.installed || 'N/A'}</td>
                <td>
                    <button class="btn-danger" style="padding:4px 10px;font-size:11px" onclick="App.confirmUninstall('${this.escapeHtml(s.name)}')">
                        <i class="fas fa-trash-can"></i> Gỡ
                    </button>
                </td>
            </tr>
        `).join('');
    },

    closeDeviceModal() {
        document.getElementById('device-modal').classList.add('hidden');
        this.currentDeviceIP = null;
    },

    switchDeviceTab(tab) {
        document.querySelectorAll('.device-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.device-tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`.device-tab[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`device-tab-${tab}`).classList.add('active');
    },

    // ================================================================
    // DEVICE ACTIONS
    // ================================================================

    deviceAction(action) {
        if (!this.currentDeviceIP) {
            this.toast('Vui lòng chọn thiết bị', 'error');
            return;
        }

        switch (action) {
            case 'remote-desktop': this.executeRemoteDesktop(this.currentDeviceIP); break;
            case 'command': this.closeDeviceModal(); window.location.hash = 'remote'; break;
            case 'install-software': this.showInstallSoftwareDialog(); break;
            case 'uninstall-software': this.showUninstallSoftwareDialog(); break;
            case 'copy-file': this.showCopyFileDialog(); break;
            case 'firewall': this.confirmToggleFirewall(); break;
            case 'windows-update': this.confirmWindowsUpdate(); break;
        }
    },

    async executeRemoteDesktop(ip) {
        try {
            const result = await api.openRemoteDesktop(ip);
            if (result && result.command) {
                this.toast(`Đang mở Remote Desktop đến ${ip}...`, 'info');
            } else {
                this.toast(`Đang kết nối RDP đến ${ip}`, 'info');
            }
        } catch (e) {
            this.toast(`Kết nối RDP đến ${ip}: ${e.message}`, 'error');
        }
    },

    showInstallSoftwareDialog() {
        const softwarePath = prompt('Nhập đường dẫn file cài đặt trên máy chủ:');
        if (softwarePath) {
            this.showConfirmDialog(
                `Bạn muốn cài đặt phần mềm từ:\n${softwarePath}\ntrên thiết bị ${this.currentDeviceIP}?`,
                async () => {
                    try {
                        await api.installSoftware(this.currentDeviceIP, softwarePath);
                        this.toast('Đang cài đặt phần mềm...', 'info');
                    } catch (e) {
                        this.toast(`Lỗi cài đặt: ${e.message}`, 'error');
                    }
                }
            );
        }
    },

    showUninstallSoftwareDialog() {
        const name = prompt('Nhập tên phần mềm cần gỡ:');
        if (name) {
            this.showConfirmDialog(
                `Bạn muốn gỡ bỏ "${name}" trên thiết bị ${this.currentDeviceIP}?`,
                async () => {
                    try {
                        await api.uninstallSoftware(this.currentDeviceIP, name);
                        this.toast('Đang gỡ bỏ phần mềm...', 'info');
                    } catch (e) {
                        this.toast(`Lỗi gỡ bỏ: ${e.message}`, 'error');
                    }
                }
            );
        }
    },

    confirmUninstall(name) {
        this.showConfirmDialog(
            `Bạn muốn gỡ bỏ "${name}" trên thiết bị ${this.currentDeviceIP}?`,
            async () => {
                try {
                    await api.uninstallSoftware(this.currentDeviceIP, name);
                    this.toast(`Đang gỡ bỏ ${name}...`, 'info');
                } catch (e) {
                    this.toast(`Lỗi: ${e.message}`, 'error');
                }
            }
        );
    },

    showCopyFileDialog() {
        const localPath = prompt('Nhập đường dẫn file trên máy chủ:');
        if (!localPath) return;
        const remotePath = prompt('Nhập đường dẫn đích trên thiết bị:');
        if (!remotePath) return;

        this.showConfirmDialog(
            `Sao chép file từ:\n${localPath}\nđến:\n${remotePath}\ntrên ${this.currentDeviceIP}?`,
            async () => {
                try {
                    await api.copyFile(this.currentDeviceIP, localPath, remotePath);
                    this.toast('Đang sao chép file...', 'info');
                } catch (e) {
                    this.toast(`Lỗi sao chép: ${e.message}`, 'error');
                }
            }
        );
    },

    confirmToggleFirewall() {
        const ip = this.currentDeviceIP;
        this.showConfirmDialog(
            `Bạn muốn thay đổi trạng thái Firewall trên ${ip}?\nHành động này có thể ảnh hưởng đến kết nối mạng.`,
            async () => {
                try {
                    await api.toggleFirewall(ip, false);
                    this.toast(`Đã thay đổi Firewall trên ${ip}`, 'warning');
                } catch (e) {
                    this.toast(`Lỗi: ${e.message}`, 'error');
                }
            }
        );
    },

    confirmWindowsUpdate() {
        const ip = this.currentDeviceIP;
        this.showConfirmDialog(
            `Bạn muốn khởi động Windows Update trên ${ip}?\nThiết bị có thể cần khởi động lại.`,
            async () => {
                try {
                    await api.triggerWindowsUpdate(ip);
                    this.toast(`Đã gửi lệnh Windows Update đến ${ip}`, 'info');
                } catch (e) {
                    this.toast(`Lỗi: ${e.message}`, 'error');
                }
            }
        );
    },

    // ================================================================
    // SCAN NETWORK
    // ================================================================

    async startScan() {
        const startIp = document.getElementById('scan-start-ip').value.trim();
        const endIp = document.getElementById('scan-end-ip').value.trim();

        if (!startIp || !endIp) {
            this.toast('Vui lòng nhập địa chỉ IP bắt đầu và kết thúc', 'warning');
            return;
        }

        // Show progress
        document.getElementById('scan-progress-section').classList.remove('hidden');
        document.getElementById('scan-results-card').classList.add('hidden');
        document.getElementById('btn-start-scan').classList.add('hidden');
        document.getElementById('btn-stop-scan').classList.remove('hidden');

        const totalIPs = this.estimateIPCount(startIp, endIp);
        this.updateScanProgress(0, 0, 0, 'Đang khởi tạo quét mạng...');

        try {
            const startTime = Date.now();
            const result = await api.scanNetwork(startIp, endIp);

            // Update progress to 100%
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const devices = result.devices || [];
            this.updateScanProgress(100, result.total_scanned || totalIPs, devices.length, 'Hoàn tất!');
            document.getElementById('scan-elapsed').textContent = `${elapsed}s`;

            // Save scanned devices
            this.devices = devices;

            // Show results
            this.showScanResults(devices);
            this.toast(`Quét hoàn tất! Tìm thấy ${devices.length} thiết bị`, 'success');

        } catch (e) {
            this.updateScanProgress(100, 0, 0, 'Lỗi: ' + e.message);
            this.toast('Lỗi quét mạng: ' + e.message, 'error');
        } finally {
            document.getElementById('btn-start-scan').classList.remove('hidden');
            document.getElementById('btn-stop-scan').classList.add('hidden');
        }
    },

    estimateIPCount(start, end) {
        const sParts = start.split('.').map(Number);
        const eParts = end.split('.').map(Number);
        const startNum = sParts[0] * 16777216 + sParts[1] * 65536 + sParts[2] * 256 + sParts[3];
        const endNum = eParts[0] * 16777216 + eParts[1] * 65536 + eParts[2] * 256 + eParts[3];
        return Math.max(1, endNum - startNum + 1);
    },

    updateScanProgress(pct, scanned, found, message) {
        document.getElementById('scan-progress-pct').textContent = `${Math.round(pct)}%`;
        document.getElementById('scan-progress-bar').style.width = `${pct}%`;
        document.getElementById('scan-scanned').textContent = scanned;
        document.getElementById('scan-found').textContent = found;
        document.getElementById('scan-status-text').textContent = message;
    },

    showScanResults(devices) {
        const card = document.getElementById('scan-results-card');
        card.classList.remove('hidden');
        const tbody = document.getElementById('scan-results-body');

        if (!devices || devices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-search"></i><p>Không tìm thấy thiết bị nào trong dải IP đã quét</p></td></tr>';
            return;
        }

        tbody.innerHTML = devices.map((d, i) => {
            const isOnline = d.reachable || d.status === 'online';
            const mac = d.mac_address || d.mac || 'N/A';
            return `
            <tr>
                <td><input type="checkbox" class="scan-result-checkbox" data-index="${i}" checked></td>
                <td><code style="color:var(--cyan)">${d.ip}</code></td>
                <td>${this.escapeHtml(d.hostname || d.ip)}</td>
                <td><code style="font-size:11px;color:var(--text-muted)">${this.escapeHtml(mac)}</code></td>
                <td>${isOnline ? '<span class="status-dot online"></span>Online' : '<span class="status-dot offline"></span>Offline'}</td>
                <td><span class="badge badge-${d.type || 'unknown'}">${this.getDeviceTypeLabel(d.type)}</span></td>
            </tr>`;
        }).join('');
    },

    stopScan() {
        document.getElementById('btn-start-scan').classList.remove('hidden');
        document.getElementById('btn-stop-scan').classList.add('hidden');
        document.getElementById('scan-status-text').textContent = 'Đã dừng';
        this.toast('Đã dừng quét', 'warning');
    },

    toggleScanSelectAll() {
        const checked = document.getElementById('scan-select-all').checked;
        document.querySelectorAll('.scan-result-checkbox').forEach(cb => cb.checked = checked);
    },

    addScanResultsToDevices() {
        const checkboxes = document.querySelectorAll('.scan-result-checkbox:checked');
        if (checkboxes.length === 0) {
            this.toast('Vui lòng chọn ít nhất một thiết bị', 'warning');
            return;
        }
        this.toast(`Đã thêm ${checkboxes.length} thiết bị vào danh sách`, 'success');
    },

    // ================================================================
    // REMOTE CONTROL
    // ================================================================

    async loadRemoteDevices() {
        const list = document.getElementById('remote-device-list');
        let devices = this.devices;

        if (devices.length === 0) {
            try {
                const data = await api.getDevices();
                devices = Array.isArray(data) ? data : (data.devices || []);
                this.devices = devices;
            } catch (e) {
                devices = [];
            }
        }

        this.renderRemoteDeviceList(devices);
    },

    renderRemoteDeviceList(devices) {
        const list = document.getElementById('remote-device-list');
        const onlineDevices = devices.filter(d => d.reachable || d.status === 'online');
        const offlineDevices = devices.filter(d => !(d.reachable || d.status === 'online'));
        const sorted = [...onlineDevices, ...offlineDevices];

        if (sorted.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Không tìm thấy thiết bị nào. Hãy quét mạng trước.</p></div>';
            return;
        }

        list.innerHTML = sorted.map(d => {
            const isOnline = d.reachable || d.status === 'online';
            return `
            <div class="remote-device-item" data-ip="${d.ip}" onclick="App.selectRemoteDevice('${d.ip}', this)">
                <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                <div>
                    <div class="device-name">${this.escapeHtml(d.hostname || d.ip)}</div>
                    <div class="device-ip">${d.ip}</div>
                </div>
            </div>`;
        }).join('');
    },

    filterRemoteDevices() {
        const search = document.getElementById('remote-device-search').value.toLowerCase();
        const filtered = this.devices.filter(d =>
            (d.ip && d.ip.includes(search)) ||
            (d.hostname && d.hostname.toLowerCase().includes(search))
        );
        this.renderRemoteDeviceList(filtered);
    },

    selectRemoteDevice(ip, element) {
        document.querySelectorAll('.remote-device-item').forEach(item => item.classList.remove('selected'));
        element.classList.add('selected');
        document.getElementById('remote-device-name').textContent = ip;
        this.currentDeviceIP = ip;

        const output = document.getElementById('terminal-output');
        output.innerHTML = `<div class="terminal-line"><span class="info">[*] Đã chọn thiết bị: ${ip}</span></div>`;
    },

    async executeCommand() {
        const input = document.getElementById('terminal-input');
        const command = input.value.trim();
        if (!command) return;

        if (!this.currentDeviceIP) {
            this.toast('Vui lòng chọn thiết bị trước', 'warning');
            return;
        }

        const output = document.getElementById('terminal-output');
        output.innerHTML += `<div class="terminal-line"><span class="cmd">${this.currentDeviceIP}$&gt; ${this.escapeHtml(command)}</span></div>`;

        const loadingId = 'exec-' + Date.now();
        output.innerHTML += `<div class="terminal-line" id="${loadingId}"><span class="info">[*] Đang thực thi...</span></div>`;
        output.scrollTop = output.scrollHeight;

        input.value = '';

        try {
            const result = await api.executeRemoteCommand(this.currentDeviceIP, command);
            const loadingEl = document.getElementById(loadingId);
            if (result.output) {
                loadingEl.innerHTML = `<span class="output">${this.escapeHtml(result.output)}</span>`;
            } else if (result.error) {
                loadingEl.innerHTML = `<span class="error">[ERROR] ${this.escapeHtml(result.error)}</span>`;
            } else {
                loadingEl.innerHTML = `<span class="output">${this.escapeHtml(JSON.stringify(result, null, 2))}</span>`;
            }
        } catch (e) {
            const loadingEl = document.getElementById(loadingId);
            loadingEl.innerHTML = `<span class="error">[ERROR] ${this.escapeHtml(e.message)}</span>`;
        }

        output.scrollTop = output.scrollHeight;
    },

    stopCommand() {
        this.toast('Đã dừng thực thi lệnh', 'warning');
    },

    openRemoteDesktop() {
        if (!this.currentDeviceIP) {
            this.toast('Vui lòng chọn thiết bị', 'warning');
            return;
        }
        this.executeRemoteDesktop(this.currentDeviceIP);
    },

    openFileCopy() {
        if (!this.currentDeviceIP) {
            this.toast('Vui lòng chọn thiết bị', 'warning');
            return;
        }
        this.showCopyFileDialog();
    },

    // ================================================================
    // ACTIVE DIRECTORY
    // ================================================================

    switchADTab(tab) {
        document.querySelectorAll('.ad-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ad-tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`.ad-tab[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`ad-tab-${tab}`).classList.add('active');
        this.closeADDetail();

        switch (tab) {
            case 'computers': this.loadADComputers(); break;
            case 'users': this.loadADUsers(); break;
            case 'groups': this.loadADGroups(); break;
        }
    },

    async loadADComputers() {
        const tbody = document.getElementById('ad-computers-body');
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="loading-spinner"></div><p>Đang tải...</p></td></tr>';
        try {
            const computers = await api.getADComputers();
            const list = Array.isArray(computers) ? computers : (computers.computers || []);
            this.renderADComputers(list);
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Không thể kết nối Active Directory. Kiểm tra cấu hình AD trong Cài đặt.</p></td></tr>`;
        }
    },

    renderADComputers(computers) {
        const tbody = document.getElementById('ad-computers-body');
        if (!computers || computers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-desktop"></i><p>Không tìm thấy máy tính nào trong Active Directory</p></td></tr>';
            return;
        }
        tbody.innerHTML = computers.map(c => `
            <tr onclick="App.showADComputerDetail('${this.escapeHtml(c.name)}')">
                <td><strong>${this.escapeHtml(c.name)}</strong></td>
                <td><code style="color:var(--cyan)">${this.escapeHtml(c.ip || 'N/A')}</code></td>
                <td>${this.escapeHtml(c.os || 'N/A')}</td>
                <td>${c.last_logon || 'N/A'}</td>
                <td>${c.enabled
                    ? '<span class="status-dot online"></span>Kích hoạt'
                    : '<span class="status-dot offline"></span>Vô hiệu hóa'
                }</td>
                <td><button class="btn-icon" title="Xem chi tiết"><i class="fas fa-eye"></i></button></td>
            </tr>
        `).join('');
    },

    async loadADUsers() {
        const tbody = document.getElementById('ad-users-body');
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="loading-spinner"></div><p>Đang tải...</p></td></tr>';
        try {
            const users = await api.getADUsers();
            const list = Array.isArray(users) ? users : (users.users || []);
            this.renderADUsers(list);
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Không thể kết nối Active Directory</p></td></tr>`;
        }
    },

    renderADUsers(users) {
        const tbody = document.getElementById('ad-users-body');
        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><i class="fas fa-user"></i><p>Không tìm thấy người dùng nào trong Active Directory</p></td></tr>';
            return;
        }
        tbody.innerHTML = users.map(u => `
            <tr>
                <td><strong>${this.escapeHtml(u.username || u.sAMAccountName || 'N/A')}</strong></td>
                <td>${this.escapeHtml(u.full_name || u.displayName || 'N/A')}</td>
                <td>${this.escapeHtml(u.email || u.mail || 'N/A')}</td>
                <td>${this.escapeHtml(u.dept || u.department || 'N/A')}</td>
                <td>${u.enabled !== false
                    ? '<span class="status-dot online"></span>Kích hoạt'
                    : '<span class="status-dot offline"></span>Khóa'
                }</td>
                <td><button class="btn-icon" title="Xem chi tiết"><i class="fas fa-eye"></i></button></td>
            </tr>
        `).join('');
    },

    async loadADGroups() {
        const tbody = document.getElementById('ad-groups-body');
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="loading-spinner"></div><p>Đang tải...</p></td></tr>';
        try {
            const groups = await api.getADGroups();
            const list = Array.isArray(groups) ? groups : (groups.groups || []);
            this.renderADGroups(list);
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Không thể kết nối Active Directory</p></td></tr>`;
        }
    },

    renderADGroups(groups) {
        const tbody = document.getElementById('ad-groups-body');
        if (!groups || groups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><i class="fas fa-users"></i><p>Không tìm thấy nhóm nào trong Active Directory</p></td></tr>';
            return;
        }
        tbody.innerHTML = groups.map(g => `
            <tr>
                <td><strong>${this.escapeHtml(g.name || g.cn || 'N/A')}</strong></td>
                <td>${this.escapeHtml(g.description || 'N/A')}</td>
                <td>${g.members || g.member_count || 0}</td>
                <td><span class="badge badge-${g.type === 'Security' ? 'admin' : 'user'}">${g.type || 'N/A'}</span></td>
                <td><button class="btn-icon" title="Xem chi tiết"><i class="fas fa-eye"></i></button></td>
            </tr>
        `).join('');
    },

    async searchAD() {
        const query = document.getElementById('ad-search').value.trim();
        if (!query) {
            this.loadADComputers();
            return;
        }

        try {
            const results = await api.searchAD(query);
            if (results.computers) this.renderADComputers(results.computers);
            if (results.users) this.renderADUsers(results.users);
            if (results.groups) this.renderADGroups(results.groups);
        } catch (e) {
            this.toast('Lỗi tìm kiếm AD: ' + e.message, 'error');
        }
    },

    async refreshAD() {
        const activeTab = document.querySelector('.ad-tab.active');
        if (activeTab) {
            this.switchADTab(activeTab.dataset.tab);
        }
        this.toast('Đã làm mới dữ liệu Active Directory', 'success');
    },

    async showADComputerDetail(name) {
        const panel = document.getElementById('ad-detail-panel');
        panel.classList.remove('hidden');
        document.getElementById('ad-detail-title').innerHTML = `<i class="fas fa-desktop"></i> Chi tiết máy tính - ${name}`;

        const content = document.getElementById('ad-detail-content');
        content.innerHTML = '<div class="loading-spinner"></div>';

        try {
            const detail = await api.getADComputerDetail(name);
            content.innerHTML = `
                <div class="detail-grid">
                    <div class="detail-item"><label>Tên máy</label><span>${this.escapeHtml(detail.name || name)}</span></div>
                    <div class="detail-item"><label>Địa chỉ IP</label><span>${this.escapeHtml(detail.ip || 'N/A')}</span></div>
                    <div class="detail-item"><label>Hệ điều hành</label><span>${this.escapeHtml(detail.os || 'N/A')}</span></div>
                    <div class="detail-item"><label>Domain</label><span>${this.escapeHtml(detail.domain || 'N/A')}</span></div>
                    <div class="detail-item"><label>OU</label><span>${this.escapeHtml(detail.ou || 'N/A')}</span></div>
                    <div class="detail-item"><label>Ngày tạo</label><span>${detail.whenCreated || 'N/A'}</span></div>
                    <div class="detail-item"><label>Nhóm</label><span>${(detail.groups || []).join(', ') || 'N/A'}</span></div>
                    <div class="detail-item"><label>Trạng thái</label><span>${detail.enabled ? 'Kích hoạt' : 'Vô hiệu hóa'}</span></div>
                </div>
            `;
        } catch (e) {
            content.innerHTML = `<div class="detail-grid"><p style="color:var(--text-muted)">Không thể tải chi tiết: ${e.message}</p></div>`;
        }
    },

    closeADDetail() {
        document.getElementById('ad-detail-panel').classList.add('hidden');
    },

    // ================================================================
    // TOPOLOGY MAP
    // ================================================================

    async loadTopologyPage() {
        await this.initTopology();
        this.renderTopology();
        this.bindTopologyWorkspace();
    },

    async initTopology() {
        if (this.topologyLoadPromise) return this.topologyLoadPromise;
        this.topologyLoadPromise = (async () => {
            try {
                const data = await api.getTopology();
                this.topology = data.topology || data || { nodes: [], links: [] };
            } catch (e) {
                this.topology = { nodes: [], links: [] };
            }
            this.ensureTopologySeed();
            this.reindexTopology();
            this.topologyLayoutLoaded = true;
            this.topologyLastLoadAt = new Date().toISOString();
        })();
        return this.topologyLoadPromise;
    },

    ensureTopologySeed() {
        if (this.topologySeeded || (this.topology.nodes && this.topology.nodes.length)) return;
        const existing = this.devices || [];
        const seed = [];
        const seen = new Set();
        const add = (node) => {
            if (!node.ip || seen.has(node.ip)) return;
            seen.add(node.ip);
            seed.push(node);
        };
        existing.slice(0, 12).forEach((d, i) => add({
            id: `seed-${i + 1}`,
            type: this.inferTopologyType(d),
            name: d.hostname || d.device_name || d.ip,
            ip: d.ip,
            x: 120 + (i % 4) * 220,
            y: 120 + Math.floor(i / 4) * 170,
            status: (d.status || d.reachable || d.online) ? 'online' : 'offline'
        }));
        this.topology.nodes = seed;
        this.topology.links = this.buildDefaultLinks(seed);
        this.topologySeeded = true;
    },

    buildDefaultLinks(nodes) {
        const links = [];
        const switches = nodes.filter(n => ['switch', 'core-switch'].includes(n.type));
        const hubs = switches.length ? switches : nodes.slice(0, 1);
        nodes.forEach((n) => {
            if (hubs[0] && n.id !== hubs[0].id) {
                links.push({ id: `link-${hubs[0].id}-${n.id}`, source: hubs[0].id, target: n.id, label: '' });
            }
        });
        return links;
    },

    inferTopologyType(device) {
        const text = `${device.hostname || ''} ${device.device_name || ''} ${device.type || ''}`.toLowerCase();
        if (text.includes('wifi') || text.includes('ap')) return 'wifi';
        if (text.includes('firewall')) return 'firewall';
        if (text.includes('server')) return 'server';
        if (text.includes('router')) return 'router';
        if (text.includes('core')) return 'core-switch';
        if (text.includes('sw') || text.includes('switch')) return 'switch';
        return 'server';
    },

    topologyTypeMeta(type) {
        const meta = {
            wifi: { label: 'Wifi', icon: 'fa-wifi', color: '#8b5cf6' },
            firewall: { label: 'Firewall', icon: 'fa-shield-halved', color: '#f97316' },
            server: { label: 'Server', icon: 'fa-server', color: '#22c55e' },
            router: { label: 'Router', icon: 'fa-route', color: '#38bdf8' },
            switch: { label: 'SW', icon: 'fa-network-wired', color: '#e94560' },
            'core-switch': { label: 'SW Core', icon: 'fa-diagram-project', color: '#f59e0b' }
        };
        return meta[type] || meta.server;
    },

    reindexTopology() {
        this.topologyMapByIp = new Map();
        (this.topology.nodes || []).forEach(n => { if (n.ip) this.topologyMapByIp.set(n.ip, n); });
        this.topologyNodeCounter = (this.topology.nodes || []).length;
        this.topologyLinkCounter = (this.topology.links || []).length;
    },

    renderTopology() {
        const workspace = document.getElementById('topology-workspace');
        const svg = document.getElementById('topology-svg');
        if (!workspace || !svg) return;
        this.topologyWorkspaceEl = workspace;
        this.topologySvgEl = svg;
        workspace.innerHTML = '';
        workspace.appendChild(svg);
        svg.innerHTML = '';
        const rect = workspace.getBoundingClientRect();
        svg.setAttribute('width', rect.width || workspace.clientWidth || 1200);
        svg.setAttribute('height', rect.height || workspace.clientHeight || 700);
        this.topologyCanvasSize = { width: rect.width || workspace.clientWidth || 1200, height: rect.height || workspace.clientHeight || 700 };
        this.renderTopologyLinks();
        this.renderTopologyNodes();
        this.ensureTopologyAnimation();
    },

    renderTopologyNodes() {
        const workspace = document.getElementById('topology-workspace');
        if (!workspace) return;
        (this.topology.nodes || []).forEach(node => {
            const meta = this.topologyTypeMeta(node.type);
            const el = document.createElement('div');
            el.className = `topology-node ${node.status === 'offline' ? 'offline' : 'online'}`;
            el.dataset.id = node.id;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            el.innerHTML = `
                <div class="topology-node-icon" style="--node-color:${meta.color}"><i class="fas ${meta.icon}"></i></div>
                <div class="topology-node-body">
                    <div class="topology-node-title">${this.escapeHtml(node.name || node.ip || 'Device')}</div>
                    <div class="topology-node-sub">${meta.label} • ${this.escapeHtml(node.ip || '')}</div>
                </div>
                <div class="topology-node-status ${node.status === 'offline' ? 'offline' : 'online'}"></div>
                ${node.status === 'offline' ? '<div class="offline-x">X</div>' : ''}
            `;
            el.addEventListener('pointerdown', (e) => this.startTopologyDrag(e, node.id));
            el.addEventListener('click', () => this.selectTopologyNode(node.id));
            workspace.appendChild(el);
        });
    },

    renderTopologyLinks() {
        const svg = document.getElementById('topology-svg');
        if (!svg) return;
        const nodesById = new Map((this.topology.nodes || []).map(n => [n.id, n]));
        (this.topology.links || []).forEach(link => {
            const s = nodesById.get(link.source);
            const t = nodesById.get(link.target);
            if (!s || !t) return;
            const x1 = s.x + 100, y1 = s.y + 36;
            const x2 = t.x + 100, y2 = t.y + 36;
            const status = s.status === 'offline' || t.status === 'offline' ? 'offline' : 'online';
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1);
            line.setAttribute('x2', x2); line.setAttribute('y2', y2);
            line.setAttribute('class', `topology-link ${status}`);
            line.dataset.linkId = link.id;
            svg.appendChild(line);
            if (status === 'offline') {
                const mid = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                mid.setAttribute('x', (x1 + x2) / 2);
                mid.setAttribute('y', (y1 + y2) / 2);
                mid.setAttribute('class', 'topology-link-offline-text');
                mid.textContent = 'X';
                svg.appendChild(mid);
            }
        });
    },

    ensureTopologyAnimation() {
        clearInterval(this.topologyAnimationTimer);
        this.topologyAnimationTimer = setInterval(() => {
            document.querySelectorAll('.topology-link.online').forEach((line, i) => {
                line.classList.toggle('pulse-a', (Date.now() / 600 + i) % 2 < 1);
            });
        }, 600);
    },

    bindTopologyWorkspace() {
        const workspace = document.getElementById('topology-workspace');
        if (!workspace || workspace._bound) return;
        workspace._bound = true;
        window.addEventListener('resize', () => this.renderTopology());
    },

    startTopologyDrag(e, id) {
        e.preventDefault();
        const node = (this.topology.nodes || []).find(n => n.id === id);
        if (!node) return;
        const startX = e.clientX, startY = e.clientY;
        const origX = node.x, origY = node.y;
        const move = (ev) => {
            node.x = Math.max(10, origX + (ev.clientX - startX));
            node.y = Math.max(10, origY + (ev.clientY - startY));
            this.renderTopology();
            this.topologyDirty = true;
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            this.saveTopologyDebounced();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    },

    selectTopologyNode(id) {
        this.selectedTopologyNodeId = id;
        document.querySelectorAll('.topology-node').forEach(n => n.classList.toggle('selected', n.dataset.id === id));
    },

    showAddNodeModal() { document.getElementById('add-node-modal').classList.remove('hidden'); },
    closeAddNodeModal() { document.getElementById('add-node-modal').classList.add('hidden'); },
    showAddLinkModal() { this.populateTopologyLinkSelectors(); document.getElementById('add-link-modal').classList.remove('hidden'); },
    closeAddLinkModal() { document.getElementById('add-link-modal').classList.add('hidden'); },

    populateTopologyLinkSelectors() {
        const s = document.getElementById('topology-link-source');
        const t = document.getElementById('topology-link-target');
        const options = (this.topology.nodes || []).map(n => `<option value="${n.id}">${this.escapeHtml(n.name || n.ip)}</option>`).join('');
        if (s) s.innerHTML = options;
        if (t) t.innerHTML = options;
    },

    addTopologyNode() {
        const type = document.getElementById('topology-node-type').value;
        const name = document.getElementById('topology-node-name').value.trim();
        const ip = document.getElementById('topology-node-ip').value.trim();
        const id = `node-${Date.now()}`;
        this.topology.nodes.push({ id, type, name: name || ip || id, ip, x: 80 + (this.topology.nodes.length % 5) * 200, y: 90 + Math.floor(this.topology.nodes.length / 5) * 150, status: this.topologyMapByIp.get(ip)?.status || 'online' });
        this.reindexTopology();
        this.closeAddNodeModal();
        this.renderTopology();
        this.saveTopologyDebounced();
    },

    addTopologyLink() {
        const source = document.getElementById('topology-link-source').value;
        const target = document.getElementById('topology-link-target').value;
        if (!source || !target || source === target) return;
        this.topology.links.push({ id: `link-${Date.now()}`, source, target, label: document.getElementById('topology-link-label').value.trim() });
        this.closeAddLinkModal();
        this.renderTopology();
        this.saveTopologyDebounced();
    },

    async saveTopology() {
        try { await api.saveTopology(this.topology); this.topologyLastSaveAt = new Date().toISOString(); this.topologyDirty = false; this.toast('Đã lưu sơ đồ topology', 'success'); }
        catch (e) { this.toast('Lỗi lưu topology: ' + e.message, 'error'); }
    },

    saveTopologyDebounced() {
        clearTimeout(this.topologySaveTimer);
        this.topologySaveTimer = setTimeout(() => this.saveTopology(), 1200);
    },

    clearTopology() {
        this.showConfirmDialog('Bạn có chắc muốn xóa toàn bộ sơ đồ topology?', () => {
            this.topology = { nodes: [], links: [] };
            this.renderTopology();
            this.saveTopology();
        });
    },

    async refreshTopologyStatuses() {
        const byIp = new Map((this.devices || []).map(d => [d.ip, d]));
        (this.topology.nodes || []).forEach(n => {
            const d = byIp.get(n.ip);
            if (d) n.status = (d.status || d.reachable || d.online) ? 'online' : 'offline';
        });
        this.renderTopology();
    },

    // ================================================================
    // SETTINGS
    // ================================================================

    async loadSettings() {
        try {
            const settings = await api.getSettings();
            if (settings) {
                if (settings.scan_interval) document.getElementById('setting-scan-interval').value = settings.scan_interval;
                if (settings.default_network) document.getElementById('setting-default-network').value = settings.default_network;
                if (settings.retry_count) document.getElementById('setting-retry-count').value = settings.retry_count;
                if (settings.timeout) document.getElementById('setting-timeout').value = settings.timeout;
                if (settings.ad_server) document.getElementById('setting-ad-server').value = settings.ad_server;
                if (settings.ad_base_dn) document.getElementById('setting-ad-base-dn').value = settings.ad_base_dn;
                if (settings.ad_bind_dn) document.getElementById('setting-ad-bind-dn').value = settings.ad_bind_dn;
            }
        } catch (e) {
            // Default values already in HTML
        }
    },

    async saveScanSettings() {
        const settings = {
            scan_interval: parseInt(document.getElementById('setting-scan-interval').value),
            default_network: document.getElementById('setting-default-network').value,
            retry_count: parseInt(document.getElementById('setting-retry-count').value),
            timeout: parseInt(document.getElementById('setting-timeout').value),
        };

        try {
            await api.updateSettings(settings);
            this.toast('Đã lưu cài đặt quét mạng', 'success');
        } catch (e) {
            this.toast('Lỗi lưu cài đặt: ' + e.message, 'error');
        }
    },

    async saveADSettings() {
        const settings = {
            ad_server: document.getElementById('setting-ad-server').value,
            ad_base_dn: document.getElementById('setting-ad-base-dn').value,
            ad_bind_dn: document.getElementById('setting-ad-bind-dn').value,
            ad_password: document.getElementById('setting-ad-password').value,
            ad_sync: document.getElementById('setting-ad-sync').checked,
        };

        try {
            await api.updateSettings(settings);
            this.toast('Đã lưu cài đặt Active Directory', 'success');
        } catch (e) {
            this.toast('Lỗi lưu cài đặt: ' + e.message, 'error');
        }
    },

    showAddUserModal() {
        const username = prompt('Tên đăng nhập mới:');
        if (!username) return;
        const fullName = prompt('Họ tên:');
        if (!fullName) return;
        const role = prompt('Vai trò (admin/user):') || 'user';

        this.toast(`Đã gửi yêu cầu tạo tài khoản: ${username}`, 'info');
    },

    // ================================================================
    // CONFIRM DIALOG
    // ================================================================

    showConfirmDialog(message, callback) {
        document.getElementById('confirm-dialog-message').textContent = message;
        document.getElementById('confirm-dialog').classList.remove('hidden');
        this.confirmCallback = callback;
    },

    confirmDialogAction() {
        if (this.confirmCallback) {
            this.confirmCallback();
            this.confirmCallback = null;
        }
        this.closeConfirmDialog();
    },

    closeConfirmDialog() {
        document.getElementById('confirm-dialog').classList.add('hidden');
        this.confirmCallback = null;
    },

    // ================================================================
    // TOAST NOTIFICATIONS
    // ================================================================

    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${message}</span>`;
        toast.addEventListener('click', () => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        });

        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('removing');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    },

    // ================================================================
    // UTILITY FUNCTIONS
    // ================================================================

    formatTime(timeStr) {
        if (!timeStr) return 'N/A';
        return timeStr;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ================================================================
// GLOBAL FUNCTIONS (called from HTML)
// ================================================================

function togglePasswordVisibility() {
    const input = document.getElementById('password');
    const icon = document.querySelector('.toggle-password i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

// ---- Login Mode Switch (Standalone vs Domain) ----
let currentLoginMode = 'standalone';

function switchLoginMode(mode) {
    currentLoginMode = mode;
    const domainField = document.getElementById('domain-field');
    const modeInfo = document.getElementById('login-mode-info');

    // Toggle tabs
    document.querySelectorAll('.login-mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    if (mode === 'domain') {
        domainField.style.display = '';
        modeInfo.className = 'login-mode-info mode-domain';
        modeInfo.innerHTML = '<i class="fas fa-building"></i><span>Đăng nhập vào mạng công ty có Domain — sử dụng tài khoản Administrator Local nội bộ để truy cập Active Directory, Remote, quản lý thiết bị</span>';
        document.getElementById('domain').focus();
    } else {
        domainField.style.display = 'none';
        modeInfo.className = 'login-mode-info';
        modeInfo.innerHTML = '<i class="fas fa-info-circle"></i><span>Đăng nhập bằng tài khoản Administrator Local — dùng để Scan/Remote trong mạng thường</span>';
        document.getElementById('username').focus();
    }
}

function toggleSidebar() {
    App.toggleSidebar();
}

// ================================================================
// INITIALIZATION
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    App.setupLoginForm();
    App.init();
});
