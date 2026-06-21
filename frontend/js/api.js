/**
 * IT Dashboard Management - API Client
 * Handles all communication with the Flask backend
 * All endpoints match the actual Flask routes
 */

class APIClient {
    constructor() {
        this.baseURL = '';
        this.token = localStorage.getItem('auth_token') || null;
    }

    getHeaders(extraHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...extraHeaders,
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    async request(method, url, body = null, options = {}) {
        const fullURL = `${this.baseURL}${url}`;
        const config = {
            method: method,
            headers: this.getHeaders(options.headers || {}),
            ...options,
        };

        if (body && method !== 'GET') {
            config.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(fullURL, config);

            if (response.status === 401) {
                this.token = null;
                localStorage.removeItem('auth_token');
                if (typeof App !== 'undefined' && App.showLogin) {
                    App.showLogin();
                    App.toast('Phiên đăng nhập đã hết hạn', 'error');
                }
                throw new APIError('Unauthorized', 401);
            }

            if (!response.ok) {
                let errorMsg = `Lỗi ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.message || errorData.error || errorMsg;
                } catch (e) { }
                throw new APIError(errorMsg, response.status);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            return await response.text();

        } catch (error) {
            if (error instanceof APIError) throw error;
            throw new APIError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.', 0);
        }
    }

    get(url, options) { return this.request('GET', url, null, options); }
    post(url, body, options) { return this.request('POST', url, body, options); }
    put(url, body, options) { return this.request('PUT', url, body, options); }
    delete(url, options) { return this.request('DELETE', url, null, options); }

    // ================================================================
    // AUTH API
    // ================================================================

    async login(username, password, mode = 'standalone', domain = '') {
        const data = await this.post('/api/auth/login', { username, password, mode, domain });
        if (data && data.token) {
            this.token = data.token;
            localStorage.setItem('auth_token', data.token);
        }
        return data;
    }

    async logout() {
        try { await this.post('/api/auth/logout'); } catch (e) { }
        this.token = null;
        localStorage.removeItem('auth_token');
    }

    async checkAuth() {
        return await this.get('/api/auth/check');
    }

    // ================================================================
    // DASHBOARD API
    // ================================================================

    async getDeviceStats() {
        return await this.get('/api/devices/stats');
    }

    async getDevices() {
        return await this.get('/api/devices');
    }

    async getRecentActivity() {
        try {
            return await this.get('/api/activity/recent');
        } catch (e) {
            // Activity endpoint may not exist yet
            return [];
        }
    }

    // ================================================================
    // NETWORK SCAN API
    // ================================================================

    async scanNetwork(startIp, endIp, timeout) {
        let url = `/api/network/scan?start_ip=${encodeURIComponent(startIp)}&end_ip=${encodeURIComponent(endIp)}`;
        if (timeout) url += `&timeout=${timeout}`;
        return await this.get(url);
    }

    async getDeviceDetails(ip) {
        return await this.get(`/api/network/device/${encodeURIComponent(ip)}/details`);
    }

    // ================================================================
    // REMOTE CONTROL API
    // ================================================================

    async executeRemoteCommand(ip, command) {
        return await this.post(`/api/devices/${encodeURIComponent(ip)}/remote`, { command });
    }

    async openRemoteDesktop(ip) {
        return await this.post(`/api/devices/${encodeURIComponent(ip)}/remote/desktop`, {});
    }

    // ================================================================
    // DEVICE ACTIONS API
    // ================================================================

    async installSoftware(ip, installerPath) {
        return await this.post(`/api/devices/${encodeURIComponent(ip)}/software/install`, { installer_path: installerPath });
    }

    async uninstallSoftware(ip, productName) {
        return await this.post(`/api/devices/${encodeURIComponent(ip)}/software/uninstall`, { product_name: productName });
    }

    async copyFile(ip, localPath, remotePath) {
        return await this.post(`/api/devices/${encodeURIComponent(ip)}/files/copy`, { local_path: localPath, remote_path: remotePath });
    }

    async toggleFirewall(ip, enable) {
        return await this.post(`/api/devices/${encodeURIComponent(ip)}/firewall/toggle`, { enable });
    }

    async triggerWindowsUpdate(ip) {
        return await this.post(`/api/devices/${encodeURIComponent(ip)}/update/windows-update`, {});
    }

    async getSystemInfo(ip) {
        return await this.get(`/api/devices/${encodeURIComponent(ip)}/system-info`);
    }

    // ================================================================
    // ACTIVE DIRECTORY API
    // ================================================================

    async getADComputers() {
        return await this.get('/api/ad/computers');
    }

    async getADUsers() {
        return await this.get('/api/ad/users');
    }

    async getADGroups() {
        return await this.get('/api/ad/groups');
    }

    async searchAD(query) {
        return await this.get(`/api/ad/search?q=${encodeURIComponent(query)}`);
    }

    async getADComputerDetail(name) {
        return await this.get(`/api/ad/computer/${encodeURIComponent(name)}/detail`);
    }

    // ================================================================
    // SETTINGS API (placeholder - add backend routes as needed)
    // ================================================================

    async getSettings() {
        try {
            return await this.get('/api/settings');
        } catch (e) {
            return null;
        }
    }

    async updateSettings(settings) {
        return await this.put('/api/settings', settings);
    }

    // ================================================================
    // TOPOLOGY API
    // ================================================================

    async getTopology() {
        try { return await this.get('/api/topology'); } catch (e) { return { nodes: [], links: [] }; }
    }

    async saveTopology(topology) {
        return await this.post('/api/topology', topology);
    }
}

class APIError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'APIError';
        this.statusCode = statusCode;
    }
}

const api = new APIClient();
