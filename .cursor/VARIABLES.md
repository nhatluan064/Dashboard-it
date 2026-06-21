# IT Dashboard — Registry biến & naming convention

> **Mục đích:** AI phải tra cứu file này trước khi đặt tên biến mới hoặc sửa code.  
> Giữ naming **nhất quán** với các mục bên dưới.

---

## Quy tắc đặt tên chung

| Layer | Convention | Ví dụ |
|-------|------------|-------|
| Python config | `SCREAMING_SNAKE` | `SCAN_TIMEOUT`, `AD_BASE_DN` |
| Python variable | `snake_case` | `device_cache`, `start_ip` |
| Python class | `PascalCase` | `NetworkScanner`, `AuthManager` |
| Flask route param | `snake_case` | `start_ip`, `end_ip` |
| JSON API field | `snake_case` | `mac_address`, `response_time_ms` |
| JS App state | `camelCase` | `currentPage`, `autoRefreshTimer` |
| JS local const | `camelCase` | `currentLoginMode` |
| DOM element id | `kebab-case` | `device-search`, `stat-total` |
| CSS class | `kebab-case` | `stat-card`, `nav-item` |
| localStorage key | `snake_case` | `auth_token`, `user_data` |
| Topology node id | `node-{timestamp}` hoặc `seed-{n}` | `node-1718888888888` |
| Topology link id | `link-{source}-{target}` hoặc `link-{timestamp}` | |

---

## 1. Backend Config (`config.py`)

| Biến | Type | Default | Env override | Mô tả |
|------|------|---------|--------------|-------|
| `SECRET_KEY` | str | `it-dashboard-flask-secret-2026` | `FLASK_SECRET_KEY` | Flask session |
| `DEBUG` | bool | `True` | `FLASK_DEBUG` | Debug mode |
| `HOST` | str | `0.0.0.0` | `FLASK_HOST` | Bind host |
| `PORT` | int | `5000` | `FLASK_PORT` | Bind port |
| `FRONTEND_DIR` | path | `../frontend` | — | Static files |
| `JWT_SECRET` | str | `it-dashboard-jwt-secret-key-2026` | `JWT_SECRET` | JWT signing |
| `JWT_EXPIRY_HOURS` | int | `8` | `JWT_EXPIRY_HOURS` | Token TTL |
| `USERS_FILE` | path | `backend/users.json` | — | User store |
| `SCAN_TIMEOUT` | int | `1000` | `SCAN_TIMEOUT` | Ping timeout (ms) |
| `SCAN_MAX_WORKERS` | int | `50` | `SCAN_MAX_WORKERS` | Thread pool |
| `DEVICE_CACHE_FILE` | path | `backend/devices_cache.json` | — | Device cache |
| `SCAN_INTERVAL_SECONDS` | int | `300` | `SCAN_INTERVAL_SECONDS` | BG scan interval |
| `COMMON_PORTS` | list[int] | 21,22,80,443,3389... | — | Port scan list |
| `PSEXEC_PATH` | str | `C:\PsTools\PsExec.exe` | `PSEXEC_PATH` | PsExec binary |
| `WMIC_TIMEOUT` | int | `30` | `WMIC_TIMEOUT` | WMI timeout (s) |
| `RDP_DOMAIN` | str | `""` | `RDP_DOMAIN` | RDP domain |
| `RDP_RESOLUTION` | str | `1920x1080` | `RDP_RESOLUTION` | RDP resolution |
| `AD_SERVER` | str | `""` | `AD_SERVER` | LDAP URL |
| `AD_PORT` | int | `636` | `AD_PORT` | LDAP port |
| `AD_USE_SSL` | bool | `True` | `AD_USE_SSL` | LDAPS |
| `AD_BASE_DN` | str | `""` | `AD_BASE_DN` | Base DN |
| `AD_BIND_DN` | str | `""` | `AD_BIND_DN` | Service bind |
| `AD_BIND_PASSWORD` | str | `""` | `AD_BIND_PASSWORD` | Bind password |
| `AD_SEARCH_OU` | str | `""` | `AD_SEARCH_OU` | OU filter |
| `AD_TIMEOUT` | int | `30` | `AD_TIMEOUT` | LDAP timeout |
| `LOG_LEVEL` | str | `INFO` | `LOG_LEVEL` | Log level |
| `LOG_FILE` | path | `backend/dashboard.log` | — | Log file |

---

## 2. Flask App instances (`app.py`)

| Attribute | Class | Mô tả |
|-----------|-------|-------|
| `app.auth_manager` | `AuthManager` | Xác thực |
| `app.scanner` | `NetworkScanner` | Quét mạng |
| `app.remote_manager` | `RemoteManager` | Remote WMI/RDP |
| `app.ad` / `app.ad_integration` | `ADIntegration` | Active Directory |

---

## 3. Device schema (NetworkScanner)

Dùng **cùng field names** khi thêm API hoặc render frontend.

```json
{
  "ip": "192.168.1.10",
  "hostname": "PC-IT-01",
  "reachable": true,
  "response_time_ms": 12,
  "mac_address": "aa:bb:cc:dd:ee:ff",
  "open_ports": [{ "port": 3389, "service": "RDP", "state": "open" }],
  "detailed_ports": [],
  "type": "windows-pc",
  "last_seen": "2026-06-21T08:00:00+00:00",
  "scan_timestamp": "2026-06-21T08:00:00+00:00",
  "from_cache": false
}
```

### Device type values (`type`)

| Value | Ý nghĩa |
|-------|---------|
| `windows-pc` | Port 3389 mở |
| `windows-server` | Port 445/135 |
| `linux-server` | Port 22, không 80 |
| `web-server` | Port 80/443 |
| `ftp-server` | Port 21 |
| `vnc-host` | Port 5900 |
| `device` | Mặc định |
| `unknown` | Frontend fallback |

### Stats response (`get_stats`)

```json
{
  "total": 0,
  "online": 0,
  "offline": 0,
  "by_type": { "windows-pc": 5 },
  "last_scan": ""
}
```

### Frontend aliases (đọc cả hai)

| Backend field | Frontend alias |
|---------------|----------------|
| `mac_address` | `mac` |
| `reachable` | `status === 'online'` |
| `user_login` | `logged_user` |
| `last_seen` | `scan_timestamp` |

---

## 4. User / Auth schema

### Login request body

```json
{
  "username": "admin",
  "password": "***",
  "mode": "standalone",
  "domain": "company.local"
}
```

| `mode` | Mô tả |
|--------|-------|
| `standalone` | Local Windows admin, bcrypt users.json |
| `domain` | AD bind, cần `domain` |

### Login response

```json
{
  "success": true,
  "token": "eyJ...",
  "user": {
    "username": "admin",
    "is_admin": true,
    "is_windows_admin": true,
    "login_mode": "standalone",
    "domain": ""
  }
}
```

### users.json entry

```json
{
  "admin": {
    "password_hash": "$2b$...",
    "is_admin": true,
    "is_windows_admin": true,
    "created_at": "ISO8601",
    "last_login": "ISO8601"
  }
}
```

### JWT payload

```json
{ "username": "admin", "is_admin": true, "iat": "...", "exp": "..." }
```

---

## 5. Topology schema (`topology.json`)

```json
{
  "nodes": [{
    "id": "node-1",
    "type": "switch",
    "name": "SW-01",
    "ip": "192.168.1.1",
    "x": 120,
    "y": 120,
    "status": "online"
  }],
  "links": [{
    "id": "link-1-2",
    "source": "node-1",
    "target": "node-2",
    "label": ""
  }],
  "updated_at": "ISO8601"
}
```

### Topology node types

`wifi` | `firewall` | `server` | `router` | `switch` | `core-switch`

---

## 6. AD object fields

### Computer

`name`, `ip`, `os`, `last_logon`, `enabled`, `domain`, `ou`, `whenCreated`, `groups[]`

### User

`username` / `sAMAccountName`, `full_name` / `displayName`, `email` / `mail`, `dept` / `department`, `enabled`

### Group

`name` / `cn`, `description`, `members` / `member_count`, `type`

---

## 7. Frontend App state (`App` object)

| Property | Type | Mô tả |
|----------|------|-------|
| `currentPage` | string | Page hash hiện tại |
| `currentDeviceIP` | string\|null | IP đang chọn (remote/modal) |
| `devices` | array | Cache danh sách thiết bị |
| `sortColumn` | string\|null | Cột sort devices |
| `sortDirection` | `'asc'\|'desc'` | Hướng sort |
| `autoRefreshEnabled` | bool | Toggle 30s refresh |
| `autoRefreshTimer` | timeout id | Interval handle |
| `charts` | object | `{ status, types }` Chart.js instances |
| `topology` | object | `{ nodes[], links[] }` |
| `topologyDirty` | bool | Có thay đổi chưa save |
| `confirmCallback` | fn\|null | Confirm dialog callback |

---

## 8. DOM Element IDs (quan trọng)

### Login

`login-page`, `login-form`, `username`, `password`, `domain`, `domain-field`, `login-btn`, `login-error`, `login-mode-info`

### Layout

`app`, `sidebar`, `page-title`, `server-time`, `toast-container`, `current-user`

### Dashboard

`stat-total`, `stat-online`, `stat-offline`, `stat-types`, `statusChart`, `typeChart`, `activity-table-body`

### Devices

`device-search`, `device-status-filter`, `device-type-filter`, `devices-table-body`, `device-count`, `auto-refresh-toggle`, `device-modal`

### Scan

`scan-start-ip`, `scan-end-ip`, `scan-method`, `btn-start-scan`, `btn-stop-scan`, `scan-progress-bar`, `scan-results-body`

### Remote

`remote-device-list`, `remote-device-search`, `remote-device-name`, `terminal-output`, `terminal-input`

### Topology

`topology-workspace`, `topology-svg`, `topology-node-type`, `topology-node-name`, `topology-node-ip`, `topology-link-source`, `topology-link-target`

### Settings

`setting-scan-interval`, `setting-default-network`, `setting-retry-count`, `setting-timeout`, `setting-ad-server`, `setting-ad-base-dn`, `setting-ad-bind-dn`, `setting-ad-password`, `setting-ad-sync`

### AD

`ad-search`, `ad-computers-body`, `ad-users-body`, `ad-groups-body`, `ad-detail-panel`, `ad-detail-content`

---

## 9. API Client methods (`api.js`)

| Method | Endpoint | Body/Params |
|--------|----------|-------------|
| `login(u,p,mode,domain)` | POST `/api/auth/login` | credentials |
| `logout()` | POST `/api/auth/logout` | — |
| `checkAuth()` | GET `/api/auth/check` | — |
| `getDeviceStats()` | GET `/api/devices/stats` | — |
| `getDevices()` | GET `/api/devices` | — |
| `getRecentActivity()` | GET `/api/activity/recent` | ⚠️ chưa có BE |
| `scanNetwork(start,end,timeout)` | GET `/api/network/scan` | query |
| `getDeviceDetails(ip)` | GET `/api/network/device/{ip}/details` | — |
| `executeRemoteCommand(ip,cmd)` | POST `/api/devices/{ip}/remote` | `{command}` |
| `openRemoteDesktop(ip)` | POST `/api/devices/{ip}/remote/desktop` | — |
| `installSoftware(ip,path)` | POST `.../software/install` | `{installer_path}` |
| `uninstallSoftware(ip,name)` | POST `.../software/uninstall` | `{product_name}` |
| `copyFile(ip,local,remote)` | POST `.../files/copy` | paths |
| `toggleFirewall(ip,enable)` | POST `.../firewall/toggle` | `{enable}` |
| `triggerWindowsUpdate(ip)` | POST `.../update/windows-update` | — |
| `getSystemInfo(ip)` | GET `.../system-info` | — |
| `getADComputers()` | GET `/api/ad/computers` | — |
| `getADUsers()` | GET `/api/ad/users` | — |
| `getADGroups()` | GET `/api/ad/groups` | — |
| `searchAD(q)` | GET `/api/ad/search?q=` | — |
| `getADComputerDetail(name)` | GET `/api/ad/computer/{name}/detail` | — |
| `getSettings()` | GET `/api/settings` | ⚠️ chưa có BE |
| `updateSettings(obj)` | PUT `/api/settings` | settings object |
| `getTopology()` | GET `/api/topology` | — |
| `saveTopology(data)` | POST `/api/topology` | `{nodes,links}` |

---

## 10. Settings schema (planned — chưa có backend)

Frontend gửi/nhận object này — **dùng đúng key khi implement backend**:

```json
{
  "scan_interval": 30,
  "default_network": "192.168.1.0/24",
  "retry_count": 3,
  "timeout": 5,
  "ad_server": "ldap://192.168.1.10",
  "ad_base_dn": "DC=company,DC=local",
  "ad_bind_dn": "CN=admin,DC=company,DC=local",
  "ad_password": "***",
  "ad_sync": true
}
```

---

## 11. CSS Variables (`style.css`)

| Variable | Usage |
|----------|-------|
| `--cyan` | IP addresses, accents |
| `--green-light` | Online status |
| `--red-light` | Offline, errors |
| `--yellow-light` | Warnings |
| `--blue-light` | Info badges |
| `--text-muted` | Secondary text |
| `--font-mono` | Code/MAC display |

---

## 12. Remote API body fields

| Action | Required fields | Optional |
|--------|-----------------|----------|
| Execute command | `command` | `username`, `password` |
| RDP | — | `username`, `domain` |
| Install SW | `installer_path` | credentials |
| Uninstall SW | `product_name` | credentials |
| Copy file | `local_path`, `remote_path` | credentials |
| Firewall | `enable` (bool) | credentials |
| Windows Update | — | credentials |

---

## Cập nhật registry

Khi thêm biến/field/id mới:

1. Thêm vào section phù hợp ở trên
2. Nếu là API mới → cập nhật section 9 và `PROJECT_CONTEXT.md` mục 6
3. Ghi chú `⚠️` nếu frontend/backend chưa đồng bộ
