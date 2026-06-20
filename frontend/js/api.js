/**
 * IT Dashboard Management - API Client
 * Handles all communication with the Flask backend
 */

class APIClient {
    constructor() {
        this.baseURL = '';
        this.token = localStorage.getItem('auth_token') || null;
    }

    /**
     * Get auth headers
     */
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

    /**
     * Core fetch wrapper with error handling
     */
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

            // Handle 401 Unauthorized - redirect to login
            if (response.status === 401) {
                this.token = null;
                localStorage.removeItem('auth_token');
                if (typeof App !== 'undefined' && App.showLogin) {
                    App.showLogin();
                    App.toast('Phiên đăng nhập đã hết hạn', 'error');
                }
                throw new APIError('Unauthorized', 401);
            }

            // Handle other errors
            if (!response.ok) {
                let errorMsg = `Lỗi ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.message || errorData.error || errorMsg;
                } catch (e) {
                    // Use default error message
                }
                throw new APIError(errorMsg, response.status);
            }

            // Handle empty responses
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            return await response.text();

        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }
            // Network error
            throw new APIError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.', 0);
        }
    }

    // ---- GET/POST/PUT/DELETE shortcuts ----
    get(url, options) { return this.request('GET', url, null, options); }
    post(url, body, options) { return this.request('POST', url, body, options); }
    put(url, body, options) { return this.request('PUT', url, body, options); }
    delete(url, options) { return this.request('DELETE', url, null, options); }

    // ================================================================
    // AUTH API
    // ================================================================

    /**
     * Login with username and password
     */
    async login(username, password) {
        const data = await this.post('/api/auth/login', { username, password });
        if (data && data.token) {
            this.token = data.token;
            localStorage.setItem('auth_token', data.token);
        }
        return data;
    }

    /**
     * Logout - clear token
     */
    async logout() {
        try {
            await this.post('/api/auth/logout');
        } catch (e) {
            // Ignore logout errors
        }
        this.token = null;
        localStorage.removeItem('auth_token');
    }

    /**
     * Check if current token is still valid
     */
    async checkAuth() {
        return await this.get('/api/auth/check');
    }

    // ================================================================
    // DASHBOARD API
    // ================================================================

    /**
     * Get device statistics for dashboard cards
     */
    async getDeviceStats() {
        return await this.get('/api/devices/stats');
    }

    /**
     * Get all devices
     */
    async getDevices() {
        return await this.get('/api/devices');
    }

    /**
     * Get single device details
     */
    async getDeviceDetails(ip) {
        return await this.get(`/api/devices/${encodeURIComponent(ip)}`);
    }

    /**
     * Get recent activity/logs
     */
    async getRecentActivity() {
        return await this.get('/api/activity/recent');
    }

    // ================================================================
    // SCAN NETWORK API
    // ================================================================

    /**
     * Start a network scan
     */
    async scanNetwork(startIp, endIp, method = 'ping') {
        return await this.post('/api/scan/start', {
            start_ip: startIp,
            end_ip: endIp,
            method: method
        });
    }

    /**
     * Get scan status/progress
     */
    async getScanStatus(scanId) {
        return await this.get(`/api/scan/status/${scanId}`);
    }

    /**
     * Stop an active scan
     */
    async stopScan(scanId) {
        return await this.post(`/api/scan/stop/${scanId}`);
    }

    /**
     * Get scan results
     */
    async getScanResults(scanId) {
        return await this.get(`/api/scan/results/${scanId}`);
    }

    // ================================================================
    // REMOTE CONTROL API
    // ================================================================

    /**
     * Execute a command on a remote device
     */
    async executeRemoteCommand(ip, command) {
        return await this.post('/api/remote/execute', {
            ip: ip,
            command: command
        });
    }

    /**
     * Open Remote Desktop session
     */
    async openRemoteDesktop(ip) {
        return await this.post('/api/remote/desktop', { ip });
    }

    // ================================================================
    // DEVICE ACTIONS API
    // ================================================================

    /**
     * Install software on a device
     */
    async installSoftware(ip, softwarePath) {
        return await this.post('/api/devices/install', {
            ip: ip,
            path: softwarePath
        });
    }

    /**
     * Uninstall software from a device
     */
    async uninstallSoftware(ip, softwareName) {
        return await this.post('/api/devices/uninstall', {
            ip: ip,
            name: softwareName
        });
    }

    /**
     * Copy file to a remote device
     */
    async copyFile(ip, localPath, remotePath) {
        return await this.post('/api/devices/copy-file', {
            ip: ip,
            local_path: localPath,
            remote_path: remotePath
        });
    }

    /**
     * Toggle firewall on a device
     */
    async toggleFirewall(ip, enable) {
        return await this.post('/api/devices/firewall', {
            ip: ip,
            enable: enable
        });
    }

    /**
     * Trigger Windows Update on a device
     */
    async triggerWindowsUpdate(ip) {
        return await this.post('/api/devices/windows-update', { ip });
    }

    /**
     * Get system info for a device
     */
    async getSystemInfo(ip) {
        return await this.get(`/api/devices/${encodeURIComponent(ip)}/system-info`);
    }

    /**
     * Get open ports for a device
     */
    async getDevicePorts(ip) {
        return await this.get(`/api/devices/${encodeURIComponent(ip)}/ports`);
    }

    /**
     * Get installed software for a device
     */
    async getDeviceSoftware(ip) {
        return await this.get(`/api/devices/${encodeURIComponent(ip)}/software`);
    }

    // ================================================================
    // ACTIVE DIRECTORY API
    // ================================================================

    /**
     * Get all AD computers
     */
    async getADComputers() {
        return await this.get('/api/ad/computers');
    }

    /**
     * Get all AD users
     */
    async getADUsers() {
        return await this.get('/api/ad/users');
    }

    /**
     * Get all AD groups
     */
    async getADGroups() {
        return await this.get('/api/ad/groups');
    }

    /**
     * Search Active Directory
     */
    async searchAD(query) {
        return await this.get(`/api/ad/search?q=${encodeURIComponent(query)}`);
    }

    /**
     * Get AD computer details
     */
    async getADComputerDetail(name) {
        return await this.get(`/api/ad/computers/${encodeURIComponent(name)}`);
    }

    /**
     * Get AD user details
     */
    async getADUserDetail(username) {
        return await this.get(`/api/ad/users/${encodeURIComponent(username)}`);
    }

    /**
     * Get AD group details
     */
    async getADGroupDetail(name) {
        return await this.get(`/api/ad/groups/${encodeURIComponent(name)}`);
    }

    // ================================================================
    // SETTINGS API
    // ================================================================

    /**
     * Get current settings
     */
    async getSettings() {
        return await this.get('/api/settings');
    }

    /**
     * Update settings
     */
    async updateSettings(settings) {
        return await this.put('/api/settings', settings);
    }

    /**
     * Get user management list
     */
    async getUsers() {
        return await this.get('/api/settings/users');
    }

    /**
     * Create a new user
     */
    async createUser(userData) {
        return await this.post('/api/settings/users', userData);
    }

    /**
     * Update user
     */
    async updateUser(userId, userData) {
        return await this.put(`/api/settings/users/${userId}`, userData);
    }

    /**
     * Delete user
     */
    async deleteUser(userId) {
        return await this.delete(`/api/settings/users/${userId}`);
    }
}

/**
 * Custom API Error class
 */
class APIError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'APIError';
        this.statusCode = statusCode;
    }
}

// Create global API instance
const api = new APIClient();
