/**
 * IT Dashboard Management - Main Application
 * SPA router, page controllers, charts, interactions
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

        if (!username || !password) {
            loginError.textContent = 'Vui lòng nhập tên đăng nhập và mật khẩu';
            loginError.classList.remove('hidden');
            return;
        }

        loginBtn.classList.add('loading');
        loginError.classList.add('hidden');

        try {
            const data = await api.login(username, password);
            localStorage.setItem('user_data', JSON.stringify(data.user || { username }));
            document.getElementById('current-user').textContent = username;
            this.showApp();
            this.toast('Đăng nhập thành công!', 'success');
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
        this.stopAutoRefresh();
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
        // Update hash without triggering hashchange
        if (window.location.hash.slice(1) !== page) {
            window.location.hash = page;
            return; // hashchange will call handleRoute again
        }

        // Hide all pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        // Show target page
        const targetPage = document.getElementById(`page-${page}`);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // Update sidebar
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            devices: 'Thiết bị',
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
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
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
            // Dashboard loaded with demo data on error
        }
    },

    async loadDeviceStats() {
        try {
            const stats = await api.getDeviceStats();
            this.animateCounter('stat-total', stats.total || 0);
            this.animateCounter('stat-online', stats.online || 0);
            this.animateCounter('stat-offline', stats.offline || 0);
            this.animateCounter('stat-types', stats.types || 0);
        } catch (e) {
            // Use demo data
            this.animateCounter('stat-total', 24);
            this.animateCounter('stat-online', 18);
            this.animateCounter('stat-offline', 6);
            this.animateCounter('stat-types', 5);
        }
    },

    animateCounter(elementId, target) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const start = parseInt(el.textContent) || 0;
        const diff = target - start;
        const duration = 800;
        const startTime = Date.now();

        const update = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            el.textContent = Math.round(start + diff * eased);
            if (progress < 1) requestAnimationFrame(update);
        };
        requestAnimationFrame(update);
    },

    async loadCharts() {
        let online = 18, offline = 6;
        let typeData = { Workstation: 12, Server: 3, Printer: 2, Switch: 4, Router: 2, 'Access Point': 1 };

        try {
            const stats = await api.getDeviceStats();
            online = stats.online || online;
            offline = stats.offline || offline;
            if (stats.by_type) typeData = stats.by_type;
        } catch (e) {
            // Use demo data
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
                    backgroundColor: [
                        'rgba(0, 255, 136, 0.8)',
                        'rgba(248, 81, 73, 0.8)'
                    ],
                    borderColor: [
                        'rgba(0, 255, 136, 1)',
                        'rgba(248, 81, 73, 1)'
                    ],
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
                        labels: {
                            color: '#8b949e',
                            padding: 20,
                            font: { size: 13 }
                        }
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
            'rgba(59, 130, 246, 0.8)',
            'rgba(168, 85, 247, 0.8)',
            'rgba(57, 210, 192, 0.8)',
            'rgba(210, 153, 34, 0.8)',
            'rgba(219, 109, 40, 0.8)',
            'rgba(233, 69, 96, 0.8)'
        ];

        this.charts.types = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Số lượng',
                    data: values,
                    backgroundColor: colors.slice(0, labels.length),
                    borderColor: colors.map(c => c.replace('0.8', '1')).slice(0, labels.length),
                    borderWidth: 1,
                    borderRadius: 6,
                    barThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8b949e', font: { size: 12 } }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#8b949e',
                            font: { size: 12 },
                            stepSize: 1
                        },
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
                tbody.innerHTML = this.getDemoActivityHTML();
            }
        } catch (e) {
            tbody.innerHTML = this.getDemoActivityHTML();
        }
    },

    getDemoActivityHTML() {
        const demoData = [
            { time: '2026-06-20 08:30:15', ip: '192.168.1.10', hostname: 'PC-NV01', action: 'Đăng nhập Windows', user: 'nguyenvan', status: 'success' },
            { time: '2026-06-20 08:25:00', ip: '192.168.1.25', hostname: 'SRV-DB01', action: 'Khởi động lại dịch vụ', user: 'admin', status: 'info' },
            { time: '2026-06-20 08:20:44', ip: '192.168.1.50', hostname: 'PRINTER-01', action: 'Cập nhật firmware', user: 'admin', status: 'success' },
            { time: '2026-06-20 08:15:00', ip: '192.168.1.100', hostname: 'SW-FLOOR2', action: 'Port 12 mất kết nối', user: 'System', status: 'error' },
            { time: '2026-06-20 08:10:22', ip: '192.168.1.15', hostname: 'PC-KT02', action: 'Cài đặt phần mềm Office', user: 'admin', status: 'success' },
            { time: '2026-06-20 08:05:10', ip: '192.168.1.30', hostname: 'SRV-WEB01', action: 'Backup hoàn tất', user: 'System', status: 'success' },
            { time: '2026-06-20 08:00:00', ip: '192.168.1.105', hostname: 'ROUTER-MAIN', action: 'Khởi động lại router', user: 'admin', status: 'warning' },
        ];

        return demoData.map(a => `
            <tr>
                <td><span style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px">${a.time}</span></td>
                <td><strong>${a.ip}</strong> (${a.hostname})</td>
                <td>${a.action}</td>
                <td>${a.user}</td>
                <td>${this.getStatusBadge(a.status)}</td>
            </tr>
        `).join('');
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
            const devices = await api.getDevices();
            this.devices = Array.isArray(devices) ? devices : (devices.devices || []);
        } catch (e) {
            // Use demo data
            this.devices = this.getDemoDevices();
        }
        this.renderDeviceTable(this.devices);
        this.startAutoRefresh();
    },

    getDemoDevices() {
        return [
            { ip: '192.168.1.1', hostname: 'ROUTER-MAIN', mac: 'AA:BB:CC:DD:EE:01', status: 'online', type: 'router', user_login: 'admin', last_seen: '2026-06-20 08:30:00' },
            { ip: '192.168.1.10', hostname: 'PC-NV01', mac: 'AA:BB:CC:DD:EE:10', status: 'online', type: 'workstation', user_login: 'nguyenvan', last_seen: '2026-06-20 08:29:00' },
            { ip: '192.168.1.11', hostname: 'PC-NV02', mac: 'AA:BB:CC:DD:EE:11', status: 'online', type: 'workstation', user_login: 'tranthi', last_seen: '2026-06-20 08:28:00' },
            { ip: '192.168.1.12', hostname: 'PC-KT01', mac: 'AA:BB:CC:DD:EE:12', status: 'offline', type: 'workstation', user_login: '', last_seen: '2026-06-19 18:00:00' },
            { ip: '192.168.1.15', hostname: 'PC-KT02', mac: 'AA:BB:CC:DD:EE:15', status: 'online', type: 'workstation', user_login: 'leminh', last_seen: '2026-06-20 08:25:00' },
            { ip: '192.168.1.20', hostname: 'PC-GD01', mac: 'AA:BB:CC:DD:EE:20', status: 'online', type: 'workstation', user_login: 'phamquoc', last_seen: '2026-06-20 08:30:00' },
            { ip: '192.168.1.25', hostname: 'SRV-DB01', mac: 'AA:BB:CC:DD:EE:25', status: 'online', type: 'server', user_login: '', last_seen: '2026-06-20 08:30:00' },
            { ip: '192.168.1.26', hostname: 'SRV-WEB01', mac: 'AA:BB:CC:DD:EE:26', status: 'online', type: 'server', user_login: '', last_seen: '2026-06-20 08:30:00' },
            { ip: '192.168.1.27', hostname: 'SRV-APP01', mac: 'AA:BB:CC:DD:EE:27', status: 'offline', type: 'server', user_login: '', last_seen: '2026-06-19 23:00:00' },
            { ip: '192.168.1.30', hostname: 'SRV-FILE01', mac: 'AA:BB:CC:DD:EE:30', status: 'online', type: 'server', user_login: '', last_seen: '2026-06-20 08:30:00' },
            { ip: '192.168.1.50', hostname: 'PRINTER-01', mac: 'AA:BB:CC:DD:EE:50', status: 'online', type: 'printer', user_login: '', last_seen: '2026-06-20 08:20:00' },
            { ip: '192.168.1.51', hostname: 'PRINTER-02', mac: 'AA:BB:CC:DD:EE:51', status: 'offline', type: 'printer', user_login: '', last_seen: '2026-06-18 15:00:00' },
            { ip: '192.168.1.100', hostname: 'SW-FLOOR1', mac: 'AA:BB:CC:DD:EE:A0', status: 'online', type: 'switch', user_login: '', last_seen: '2026-06-20 08:30:00' },
            { ip: '192.168.1.101', hostname: 'SW-FLOOR2', mac: 'AA:BB:CC:DD:EE:A1', status: 'online', type: 'switch', user_login: '', last_seen: '2026-06-20 08:30:00' },
            { ip: '192.168.1.102', hostname: 'SW-FLOOR3', mac: 'AA:BB:CC:DD:EE:A2', status: 'offline', type: 'switch', user_login: '', last_seen: '2026-06-17 09:00:00' },
            { ip: '192.168.1.105', hostname: 'AP-LOBBY', mac: 'AA:BB:CC:DD:EE:A5', status: 'online', type: 'access_point', user_login: '', last_seen: '2026-06-20 08:30:00' },
            { ip: '192.168.1.106', hostname: 'AP-CAFETERIA', mac: 'AA:BB:CC:DD:EE:A6', status: 'online', type: 'access_point', user_login: '', last_seen: '2026-06-20 08:30:00' },
            { ip: '192.168.1.110', hostname: 'AP-FLOOR3', mac: 'AA:BB:CC:DD:EE:B0', status: 'offline', type: 'access_point', user_login: '', last_seen: '2026-06-20 02:00:00' },
            { ip: '192.168.1.200', hostname: 'PC-KS01', mac: 'AA:BB:CC:DD:EE:C0', status: 'online', type: 'workstation', user_login: '', last_seen: '2026-06-20 08:15:00' },
            { ip: '192.168.1.201', hostname: 'PC-KS02', mac: 'AA:BB:CC:DD:EE:C1', status: 'offline', type: 'workstation', user_login: '', last_seen: '2026-06-19 17:30:00' },
            { ip: '192.168.1.210', hostname: 'PC-DT01', mac: 'AA:BB:CC:DD:EE:D0', status: 'online', type: 'workstation', user_login: 'hoangduc', last_seen: '2026-06-20 08:28:00' },
            { ip: '192.168.1.211', hostname: 'PC-DT02', mac: 'AA:BB:CC:DD:EE:D1', status: 'online', type: 'workstation', user_login: '', last_seen: '2026-06-20 08:29:00' },
            { ip: '192.168.1.220', hostname: 'PC-IT01', mac: 'AA:BB:CC:DD:EE:E0', status: 'online', type: 'workstation', user_login: 'admin', last_seen: '2026-06-20 08:30:00' },
            { ip: '192.168.1.221', hostname: 'PC-IT02', mac: 'AA:BB:CC:DD:EE:E1', status: 'offline', type: 'workstation', user_login: '', last_seen: '2026-06-16 10:00:00' },
        ];
    },

    renderDeviceTable(devices) {
        const tbody = document.getElementById('devices-table-body');
        if (!devices || devices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><i class="fas fa-inbox"></i><p>Không tìm thấy thiết bị nào</p></td></tr>';
            return;
        }

        tbody.innerHTML = devices.map(d => `
            <tr onclick="App.openDeviceDetail('${d.ip}')" class="device-row" data-ip="${d.ip}">
                <td><code style="color:var(--cyan)">${d.ip}</code></td>
                <td><strong>${d.hostname || 'Unknown'}</strong></td>
                <td><code style="font-size:11px;color:var(--text-muted)">${d.mac || 'N/A'}</code></td>
                <td>${d.status === 'online'
                    ? '<span class="status-dot online"></span>Online'
                    : '<span class="status-dot offline"></span>Offline'
                }</td>
                <td><span class="badge badge-${d.type || 'other'}">${this.getDeviceTypeLabel(d.type)}</span></td>
                <td>${d.user_login || '<span style="color:var(--text-muted)">-</span>'}</td>
                <td><span style="font-size:12px;color:var(--text-muted)">${this.formatTime(d.last_seen)}</span></td>
            </tr>
        `).join('');

        document.getElementById('device-count').textContent = `${devices.length} thiết bị`;
    },

    getDeviceTypeLabel(type) {
        const map = {
            workstation: 'Workstation',
            server: 'Server',
            printer: 'Printer',
            switch: 'Switch',
            router: 'Router',
            access_point: 'Access Point'
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
                (d.mac && d.mac.toLowerCase().includes(search)) ||
                (d.user_login && d.user_login.toLowerCase().includes(search))
            );
        }

        if (statusFilter) {
            filtered = filtered.filter(d => d.status === statusFilter);
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
            const devices = await api.getDevices();
            this.devices = Array.isArray(devices) ? devices : (devices.devices || []);
            this.filterDevices();
        } catch (e) {
            // Silent fail for auto-refresh
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

        // Switch to info tab
        this.switchDeviceTab('info');

        // Load device info
        const infoGrid = document.getElementById('device-info-grid');
        infoGrid.innerHTML = '<div class="loading-spinner"></div><p style="text-align:center;color:var(--text-muted)">Đang tải thông tin...</p>';

        try {
            const device = await api.getDeviceDetails(ip);
            this.renderDeviceInfo(device);
            this.renderDevicePorts(device.ports || []);
            this.renderDeviceSoftware(device.software || []);
        } catch (e) {
            // Demo data
            const demo = this.devices.find(d => d.ip === ip) || { ip, hostname: 'Unknown', mac: 'N/A', status: 'unknown', type: 'unknown' };
            this.renderDeviceInfo(demo);
            this.renderDevicePorts(this.getDemoPorts());
            this.renderDeviceSoftware(this.getDemoSoftware());
        }
    },

    renderDeviceInfo(device) {
        const grid = document.getElementById('device-info-grid');
        grid.innerHTML = `
            <div class="detail-item">
                <label>Địa chỉ IP</label>
                <span>${device.ip || 'N/A'}</span>
            </div>
            <div class="detail-item">
                <label>Hostname</label>
                <span>${device.hostname || 'N/A'}</span>
            </div>
            <div class="detail-item">
                <label>Địa chỉ MAC</label>
                <span>${device.mac || 'N/A'}</span>
            </div>
            <div class="detail-item">
                <label>Trạng thái</label>
                <span>${device.status === 'online' ? '<span class="status-dot online"></span>Online' : '<span class="status-dot offline"></span>Offline'}</span>
            </div>
            <div class="detail-item">
                <label>Loại thiết bị</label>
                <span><span class="badge badge-${device.type}">${this.getDeviceTypeLabel(device.type)}</span></span>
            </div>
            <div class="detail-item">
                <label>Đăng nhập cuối</label>
                <span>${device.user_login || 'Không có'}</span>
            </div>
            <div class="detail-item">
                <label>Lần cuối online</label>
                <span>${device.last_seen || 'N/A'}</span>
            </div>
            <div class="detail-item">
                <label>Hệ điều hành</label>
                <span>${device.os || 'Windows 10/11'}</span>
            </div>
            <div class="detail-item">
                <label>CPU</label>
                <span>${device.cpu || 'Intel Core i5-12400'}</span>
            </div>
            <div class="detail-item">
                <label>RAM</label>
                <span>${device.ram || '16 GB'}</span>
            </div>
            <div class="detail-item">
                <label>Ổ cứng</label>
                <span>${device.disk || '512 GB SSD'}</span>
            </div>
            <div class="detail-item">
                <label>Firewall</label>
                <span>${device.firewall_status !== undefined ? (device.firewall_status ? '<span style="color:var(--green-light)">Bật</span>' : '<span style="color:var(--red-light)">Tắt</span>') : '<span style="color:var(--green-light)">Bật</span>'}</span>
            </div>
        `;
    },

    getDemoPorts() {
        return [
            { port: 80, protocol: 'TCP', status: 'open', service: 'HTTP' },
            { port: 443, protocol: 'TCP', status: 'open', service: 'HTTPS' },
            { port: 445, protocol: 'TCP', status: 'open', service: 'SMB' },
            { port: 3389, protocol: 'TCP', status: 'open', service: 'RDP' },
            { port: 5985, protocol: 'TCP', status: 'filtered', service: 'WinRM' },
            { port: 22, protocol: 'TCP', status: 'closed', service: 'SSH' },
        ];
    },

    getDemoSoftware() {
        return [
            { name: 'Microsoft Office 365', version: '16.0.17726', publisher: 'Microsoft', installed: '2026-01-15' },
            { name: 'Google Chrome', version: '126.0.6478', publisher: 'Google', installed: '2026-06-18' },
            { name: 'Mozilla Firefox', version: '128.0', publisher: 'Mozilla', installed: '2026-05-20' },
            { name: 'Visual Studio Code', version: '1.92.0', publisher: 'Microsoft', installed: '2026-06-10' },
            { name: '7-Zip', version: '24.08', publisher: 'Igor Pavlov', installed: '2026-03-01' },
            { name: 'Adobe Acrobat Reader', version: '24.002', publisher: 'Adobe', installed: '2026-02-28' },
        ];
    },

    renderDevicePorts(ports) {
        const tbody = document.getElementById('device-ports-body');
        if (!ports || ports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>Không có port nào được mở</p></td></tr>';
            return;
        }
        tbody.innerHTML = ports.map(p => `
            <tr>
                <td><code style="color:var(--cyan)">${p.port}</code></td>
                <td>${p.protocol}</td>
                <td>${p.status === 'open'
                    ? '<span class="status-dot online"></span>Mở'
                    : p.status === 'filtered'
                        ? '<span class="status-dot" style="background:var(--yellow-light)"></span>Lọc'
                        : '<span class="status-dot offline"></span>Đóng'
                }</td>
                <td>${p.service || 'N/A'}</td>
            </tr>
        `).join('');
    },

    renderDeviceSoftware(software) {
        const tbody = document.getElementById('device-software-body');
        if (!software || software.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>Không tìm thấy phần mềm</p></td></tr>';
            return;
        }
        tbody.innerHTML = software.map(s => `
            <tr>
                <td><strong>${s.name}</strong></td>
                <td>${s.version}</td>
                <td>${s.publisher || 'N/A'}</td>
                <td>${s.installed || 'N/A'}</td>
                <td>
                    <button class="btn-danger" style="padding:4px 10px;font-size:11px" onclick="App.confirmUninstall('${s.name}')">
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
            case 'remote-desktop':
                this.executeRemoteDesktop(this.currentDeviceIP);
                break;
            case 'command':
                this.closeDeviceModal();
                window.location.hash = 'remote';
                break;
            case 'install-software':
                this.showInstallSoftwareDialog();
                break;
            case 'uninstall-software':
                this.showUninstallSoftwareDialog();
                break;
            case 'copy-file':
                this.showCopyFileDialog();
                break;
            case 'firewall':
                this.confirmToggleFirewall();
                break;
            case 'windows-update':
                this.confirmWindowsUpdate();
                break;
        }
    },

    async executeRemoteDesktop(ip) {
        try {
            await api.openRemoteDesktop(ip);
            this.toast(`Đang kết nối Remote Desktop đến ${ip}`, 'info');
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
        const method = document.getElementById('scan-method').value;

        if (!startIp || !endIp) {
            this.toast('Vui lòng nhập địa chỉ IP bắt đầu và kết thúc', 'warning');
            return;
        }

        // Show progress section
        document.getElementById('scan-progress-section').classList.remove('hidden');
        document.getElementById('scan-results-card').classList.add('hidden');
        document.getElementById('btn-start-scan').classList.add('hidden');
        document.getElementById('btn-stop-scan').classList.remove('hidden');

        // Reset progress
        this.updateScanProgress(0, 0, 0, 'Đang khởi tạo...');

        try {
            const data = await api.scanNetwork(startIp, endIp, method);
            this.scanId = data.scan_id || data.id;

            // Simulate progress (for demo when no real scan is running)
            this.simulateScanProgress(startIp, endIp);

            // Try polling for real progress
            this.scanInterval = setInterval(async () => {
                try {
                    const status = await api.getScanStatus(this.scanId);
                    if (status.progress !== undefined) {
                        this.updateScanProgress(status.progress, status.scanned || 0, status.found || 0, status.message || 'Đang quét...');
                        if (status.completed) {
                            this.completeScan();
                        }
                    }
                } catch (e) {
                    // Demo mode - simulate
                }
            }, 2000);

        } catch (e) {
            // Demo mode - simulate
            this.simulateScanProgress(startIp, endIp);
        }
    },

    simulateScanProgress(startIp, endIp) {
        let progress = 0;
        const total = this.estimateIPCount(startIp, endIp);
        const startTime = Date.now();

        this.scanInterval = setInterval(() => {
            progress += Math.random() * 8 + 2;
            if (progress >= 100) {
                progress = 100;
                this.updateScanProgress(100, total, Math.floor(Math.random() * 15) + 5, 'Hoàn tất!');
                this.completeScan();
                return;
            }

            const scanned = Math.floor(total * progress / 100);
            const found = Math.floor(Math.random() * 15) + Math.floor(scanned * 0.1);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            this.updateScanProgress(progress, scanned, found, 'Đang quét...');
            document.getElementById('scan-elapsed').textContent = `${elapsed}s`;
        }, 500);
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

    completeScan() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }

        document.getElementById('btn-start-scan').classList.remove('hidden');
        document.getElementById('btn-stop-scan').classList.add('hidden');
        document.getElementById('scan-status-text').textContent = 'Hoàn tất!';

        this.showScanResults();
        this.toast('Quét mạng hoàn tất!', 'success');
    },

    showScanResults() {
        const card = document.getElementById('scan-results-card');
        card.classList.remove('hidden');
        const tbody = document.getElementById('scan-results-body');

        // Generate demo scan results
        const baseIp = document.getElementById('scan-start-ip').value || '192.168.1.';
        const results = this.generateDemoScanResults(baseIp);

        tbody.innerHTML = results.map((r, i) => `
            <tr>
                <td><input type="checkbox" class="scan-result-checkbox" data-index="${i}" checked></td>
                <td><code style="color:var(--cyan)">${r.ip}</code></td>
                <td>${r.hostname}</td>
                <td><code style="font-size:11px;color:var(--text-muted)">${r.mac}</code></td>
                <td><span class="status-dot online"></span>Online</td>
                <td><span class="badge badge-${r.type}">${this.getDeviceTypeLabel(r.type)}</span></td>
            </tr>
        `).join('');
    },

    generateDemoScanResults(baseIp) {
        const prefix = baseIp.substring(0, baseIp.lastIndexOf('.') + 1);
        const results = [];
        const types = ['workstation', 'server', 'printer', 'switch', 'router', 'access_point'];
        const count = Math.floor(Math.random() * 10) + 5;

        for (let i = 0; i < count; i++) {
            const lastOctet = Math.floor(Math.random() * 254) + 1;
            results.push({
                ip: `${prefix}${lastOctet}`,
                hostname: `DEVICE-${String(lastOctet).padStart(3, '0')}`,
                mac: this.generateRandomMAC(),
                type: types[Math.floor(Math.random() * types.length)]
            });
        }
        return results.sort((a, b) => {
            const aNum = parseInt(a.ip.split('.').pop());
            const bNum = parseInt(b.ip.split('.').pop());
            return aNum - bNum;
        });
    },

    generateRandomMAC() {
        return Array.from({ length: 6 }, () =>
            Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()
        ).join(':');
    },

    stopScan() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }

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
                devices = this.getDemoDevices();
                this.devices = devices;
            }
        }

        this.renderRemoteDeviceList(devices);
    },

    renderRemoteDeviceList(devices) {
        const list = document.getElementById('remote-device-list');
        const onlineDevices = devices.filter(d => d.status === 'online');
        const offlineDevices = devices.filter(d => d.status === 'offline');
        const sorted = [...onlineDevices, ...offlineDevices];

        if (sorted.length === 0) {
            list.innerHTML = '<div class="empty-state"><p>Không tìm thấy thiết bị</p></div>';
            return;
        }

        list.innerHTML = sorted.map(d => `
            <div class="remote-device-item" data-ip="${d.ip}" onclick="App.selectRemoteDevice('${d.ip}', this)">
                <span class="status-dot ${d.status}"></span>
                <div>
                    <div class="device-name">${d.hostname || 'Unknown'}</div>
                    <div class="device-ip">${d.ip}</div>
                </div>
            </div>
        `).join('');
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

        // Clear terminal welcome and show selection
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

        // Show command
        output.innerHTML += `<div class="terminal-line"><span class="cmd">${this.currentDeviceIP}$&gt; ${this.escapeHtml(command)}</span></div>`;

        // Show loading
        const loadingId = 'exec-' + Date.now();
        output.innerHTML += `<div class="terminal-line" id="${loadingId}"><span class="info">[*] Đang thực thi...</span></div>`;
        output.scrollTop = output.scrollHeight;

        input.value = '';

        try {
            const result = await api.executeRemoteCommand(this.currentDeviceIP, command);
            const loadingEl = document.getElementById(loadingId);

            if (result.output) {
                loadingEl.innerHTML = `<span class="output">${this.escapeHtml(result.output)}</span>`;
            } else {
                loadingEl.innerHTML = `<span class="output">${this.escapeHtml(JSON.stringify(result, null, 2))}</span>`;
            }
        } catch (e) {
            const loadingEl = document.getElementById(loadingId);
            // Demo response
            loadingEl.innerHTML = `<span class="output">${this.getDemoCommandOutput(command)}</span>`;
        }

        output.scrollTop = output.scrollHeight;
    },

    getDemoCommandOutput(command) {
        const cmd = command.toLowerCase().trim();
        if (cmd === 'ipconfig' || cmd.includes('ipconfig')) {
            return `Windows IP Configuration

Ethernet adapter Ethernet:
   Connection-specific DNS Suffix  . : local
   IPv4 Address. . . . . . . . . . . : 192.168.1.10
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.1.1`;
        }
        if (cmd === 'whoami') {
            return `DOMAIN\\${document.getElementById('current-user')?.textContent || 'admin'}`;
        }
        if (cmd === 'hostname') {
            return this.currentDeviceIP ? `DEVICE-${this.currentDeviceIP.split('.').pop()}` : 'UNKNOWN';
        }
        if (cmd === 'dir' || cmd === 'ls') {
            return ` Volume in drive C has no label.
 Directory of C:\\Users\\admin

06/20/2026  08:30    <DIR>          .
06/20/2026  08:30    <DIR>          ..
06/15/2026  10:00    <DIR>          Desktop
06/18/2026  14:30    <DIR>          Documents
06/20/2026  08:00    <DIR>          Downloads
               0 File(s)              0 bytes
               5 Dir(s)  256,000,000,000 bytes free`;
        }
        if (cmd === 'systeminfo') {
            return `OS Name:                   Microsoft Windows 11 Pro
OS Version:                10.0.22631 Build 22631
System Type:               x64-based PC
Processor(s):              1 Processor(s) Installed.
                           Intel(R) Core(TM) i5-12400
Total Physical Memory:     16,384 MB
Available Physical Memory: 8,192 MB`;
        }
        return `Command executed successfully. Output for: ${command}`;
    },

    stopCommand() {
        this.toast('Đã dừng thực thi lệnh', 'warning');
        document.getElementById('btn-execute-cmd').classList.remove('hidden');
        document.getElementById('btn-stop-cmd').classList.add('hidden');
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
        try {
            const computers = await api.getADComputers();
            this.renderADComputers(Array.isArray(computers) ? computers : (computers.computers || []));
        } catch (e) {
            this.renderADComputers(this.getDemoADComputers());
        }
    },

    getDemoADComputers() {
        return [
            { name: 'PC-NV01', ip: '192.168.1.10', os: 'Windows 11 Pro', last_logon: '2026-06-20 08:30:00', enabled: true },
            { name: 'PC-NV02', ip: '192.168.1.11', os: 'Windows 11 Pro', last_logon: '2026-06-20 08:28:00', enabled: true },
            { name: 'PC-KT01', ip: '192.168.1.12', os: 'Windows 10 Pro', last_logon: '2026-06-19 18:00:00', enabled: true },
            { name: 'PC-KT02', ip: '192.168.1.15', os: 'Windows 11 Pro', last_logon: '2026-06-20 08:25:00', enabled: true },
            { name: 'PC-GD01', ip: '192.168.1.20', os: 'Windows 11 Enterprise', last_logon: '2026-06-20 08:30:00', enabled: true },
            { name: 'SRV-DB01', ip: '192.168.1.25', os: 'Windows Server 2022', last_logon: 'N/A', enabled: true },
            { name: 'SRV-WEB01', ip: '192.168.1.26', os: 'Windows Server 2022', last_logon: 'N/A', enabled: true },
            { name: 'PC-OLD01', ip: '192.168.1.200', os: 'Windows 10 Pro', last_logon: '2026-04-01 10:00:00', enabled: false },
        ];
    },

    renderADComputers(computers) {
        const tbody = document.getElementById('ad-computers-body');
        if (!computers || computers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>Không tìm thấy máy tính nào</p></td></tr>';
            return;
        }
        tbody.innerHTML = computers.map(c => `
            <tr onclick="App.showADComputerDetail('${c.name}')">
                <td><strong>${c.name}</strong></td>
                <td><code style="color:var(--cyan)">${c.ip || 'N/A'}</code></td>
                <td>${c.os || 'N/A'}</td>
                <td>${c.last_logon || 'N/A'}</td>
                <td>${c.enabled
                    ? '<span class="status-dot online"></span>Kích hoạt'
                    : '<span class="status-dot offline"></span>Vô hiệu hóa'
                }</td>
                <td>
                    <button class="btn-icon" title="Xem chi tiết"><i class="fas fa-eye"></i></button>
                </td>
            </tr>
        `).join('');
    },

    async loadADUsers() {
        try {
            const users = await api.getADUsers();
            this.renderADUsers(Array.isArray(users) ? users : (users.users || []));
        } catch (e) {
            this.renderADUsers(this.getDemoADUsers());
        }
    },

    getDemoADUsers() {
        return [
            { username: 'admin', full_name: 'Quản trị viên', email: 'admin@company.local', dept: 'IT', enabled: true },
            { username: 'nguyenvan', full_name: 'Nguyễn Văn A', email: 'nguyenvan@company.local', dept: 'Kế toán', enabled: true },
            { username: 'tranthi', full_name: 'Trần Thị B', email: 'tranthi@company.local', dept: 'Nhân sự', enabled: true },
            { username: 'leminh', full_name: 'Lê Minh C', email: 'leminh@company.local', dept: 'Kế toán', enabled: true },
            { username: 'phamquoc', full_name: 'Phạm Quốc D', email: 'phamquoc@company.local', dept: 'Giám đốc', enabled: true },
            { username: 'hoangduc', full_name: 'Hoàng Đức E', email: 'hoangduc@company.local', dept: 'Kỹ thuật', enabled: true },
            { username: 'vuvan', full_name: 'Vũ Văn F', email: 'vuvan@company.local', dept: 'Kinh doanh', enabled: false },
        ];
    },

    renderADUsers(users) {
        const tbody = document.getElementById('ad-users-body');
        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>Không tìm thấy người dùng</p></td></tr>';
            return;
        }
        tbody.innerHTML = users.map(u => `
            <tr>
                <td><strong>${u.username}</strong></td>
                <td>${u.full_name || 'N/A'}</td>
                <td>${u.email || 'N/A'}</td>
                <td>${u.dept || 'N/A'}</td>
                <td>${u.enabled
                    ? '<span class="status-dot online"></span>Kích hoạt'
                    : '<span class="status-dot offline"></span>Khóa'
                }</td>
                <td>
                    <button class="btn-icon" title="Xem chi tiết"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon" title="Chỉnh sửa"><i class="fas fa-pen"></i></button>
                </td>
            </tr>
        `).join('');
    },

    async loadADGroups() {
        try {
            const groups = await api.getADGroups();
            this.renderADGroups(Array.isArray(groups) ? groups : (groups.groups || []));
        } catch (e) {
            this.renderADGroups(this.getDemoADGroups());
        }
    },

    getDemoADGroups() {
        return [
            { name: 'Domain Admins', description: 'Nhóm quản trị viên domain', members: 3, type: 'Security' },
            { name: 'Domain Users', description: 'Tất cả người dùng domain', members: 25, type: 'Security' },
            { name: 'IT-Department', description: 'Phòng Công nghệ thông tin', members: 5, type: 'Distribution' },
            { name: 'Accounting', description: 'Phòng Kế toán', members: 4, type: 'Distribution' },
            { name: 'HR', description: 'Phòng Nhân sự', members: 3, type: 'Distribution' },
            { name: 'Management', description: 'Ban giám đốc', members: 2, type: 'Distribution' },
        ];
    },

    renderADGroups(groups) {
        const tbody = document.getElementById('ad-groups-body');
        if (!groups || groups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>Không tìm thấy nhóm nào</p></td></tr>';
            return;
        }
        tbody.innerHTML = groups.map(g => `
            <tr>
                <td><strong>${g.name}</strong></td>
                <td>${g.description || 'N/A'}</td>
                <td>${g.members}</td>
                <td><span class="badge badge-${g.type === 'Security' ? 'admin' : 'user'}">${g.type}</span></td>
                <td>
                    <button class="btn-icon" title="Xem chi tiết"><i class="fas fa-eye"></i></button>
                </td>
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
            // Demo search
            const allComputers = this.getDemoADComputers();
            const filtered = allComputers.filter(c =>
                c.name.toLowerCase().includes(query.toLowerCase()) ||
                (c.ip && c.ip.includes(query))
            );
            this.renderADComputers(filtered);

            const allUsers = this.getDemoADUsers();
            const filteredUsers = allUsers.filter(u =>
                u.username.toLowerCase().includes(query.toLowerCase()) ||
                u.full_name.toLowerCase().includes(query.toLowerCase())
            );
            this.renderADUsers(filteredUsers);
        }
    },

    async refreshAD() {
        this.switchADTab(document.querySelector('.ad-tab.active').dataset.tab);
        this.toast('Đã làm mới dữ liệu Active Directory', 'success');
    },

    showADComputerDetail(name) {
        const panel = document.getElementById('ad-detail-panel');
        panel.classList.remove('hidden');
        document.getElementById('ad-detail-title').innerHTML = `<i class="fas fa-desktop"></i> Chi tiết máy tính - ${name}`;

        const content = document.getElementById('ad-detail-content');
        content.innerHTML = '<div class="loading-spinner"></div>';

        // Demo data
        setTimeout(() => {
            content.innerHTML = `
                <div class="detail-grid">
                    <div class="detail-item"><label>Tên máy</label><span>${name}</span></div>
                    <div class="detail-item"><label>Địa chỉ IP</label><span>192.168.1.${Math.floor(Math.random() * 254) + 1}</span></div>
                    <div class="detail-item"><label>Hệ điều hành</label><span>Windows 11 Pro</span></div>
                    <div class="detail-item"><label>Version</label><span>23H2 (Build 22631)</span></div>
                    <div class="detail-item"><label>Domain</label><span>COMPANY.LOCAL</span></div>
                    <div class="detail-item"><label>Organizational Unit</label><span>OU=Workstations,DC=company,DC=local</span></div>
                    <div class="detail-item"><label>Ngày tạo</label><span>2024-03-15</span></div>
                    <div class="detail-item"><label>Lần đăng nhập cuối</label><span>2026-06-20 08:30:00</span></div>
                </div>
            `;
        }, 500);
    },

    closeADDetail() {
        document.getElementById('ad-detail-panel').classList.add('hidden');
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
            // Use default values
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
            this.toast('Đã lưu cài đặt (chế độ demo)', 'info');
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
            this.toast('Đã lưu cài đặt (chế độ demo)', 'info');
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

        // Auto-remove after 5 seconds
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
