# IT Dashboard — Ngữ cảnh dự án cho AI

> **Mục đích:** File này giúp AI nhanh chóng hiểu dự án, tiến độ, quy ước code.  
> **Đọc kèm:** [`.cursor/VARIABLES.md`](.cursor/VARIABLES.md) (tên biến, ID, schema)  
> **Skill:** `.cursor/skills/dashboard-it/SKILL.md`

---

## 1. Tóm tắt

| Mục | Giá trị |
|-----|---------|
| Tên | IT Dashboard Management System |
| Mục đích | Giám sát & quản lý mạng nội bộ công ty (localhost) |
| Stack | Flask (Python 3.12+) + Vanilla JS SPA + Chart.js |
| Chạy | `Start-Dashboard.bat` hoặc `cd backend && python app.py` |
| URL | http://127.0.0.1:5000 |
| Ngôn ngữ UI | Tiếng Việt |
| Nền tảng | Windows 10/11 (WMI, PsExec, ping, arp) |

---

## 2. Cấu trúc thư mục

```
Dashboard-it/
├── PROJECT_CONTEXT.md          ← File này
├── .cursor/
│   ├── VARIABLES.md            ← Registry biến / ID / schema
│   ├── rules/dashboard-it.mdc  ← Rule luôn áp dụng
│   └── skills/dashboard-it/    ← Skill hướng dẫn AI
├── backend/
│   ├── app.py                  ← Flask routes (~25 API)
│   ├── config.py               ← Config class + env vars
│   ├── modules/
│   │   ├── auth.py             ← JWT, bcrypt, Windows/AD login
│   │   ├── network_scanner.py  ← Ping, port scan, device cache
│   │   ├── remote_manager.py   ← WMI/PsExec/RDP
│   │   └── ad_integration.py   ← LDAP Active Directory
│   ├── users.json              ← User store (runtime)
│   ├── devices_cache.json      ← Device cache (runtime)
│   └── topology.json           ← Sơ đồ mạng 2D (runtime)
├── frontend/
│   ├── index.html              ← SPA, hash routing
│   ├── css/style.css           ← Dark theme
│   └── js/
│       ├── api.js              ← APIClient class
│       └── app.js              ← App object (logic chính)
├── Start-Dashboard.bat
└── Stop-Dashboard.bat
```

---

## 3. Kiến trúc

```
Browser (SPA)
    │  fetch /api/*
    ▼
Flask app.py
    ├── AuthManager      → users.json, JWT
    ├── NetworkScanner   → devices_cache.json, ping/arp/port
    ├── RemoteManager    → WMI, PsExec, RDP
    └── ADIntegration    → ldap3, AD queries
```

**Frontend pattern:** Object `App` (state + methods), hash router `#dashboard|devices|topology|scan|remote|ad|settings`.  
**API pattern:** JSON `{ success, message?, ...data }`, auth qua `Bearer` token hoặc Flask session.

---

## 4. Tiến độ dự án (Roadmap)

Cập nhật lần cuối: **2026-06-21**

### ✅ Đã hoàn thành

| Module | Chi tiết |
|--------|----------|
| Auth | Login standalone (local admin) + domain (AD bind), JWT, auto-register user đầu tiên |
| Dashboard | Stats cards, Chart.js doughnut/bar, bảng hoạt động (UI sẵn) |
| Devices | Danh sách, filter, sort, auto-refresh 30s, modal chi tiết |
| Network Scan | Ping sweep dải IP, progress bar, kết quả quét |
| Remote Control | Terminal WMI, RDP, chọn thiết bị |
| Device Actions | Install/uninstall SW, copy file, firewall, Windows Update (backend có route) |
| Active Directory | Computers/Users/Groups, search, computer detail |
| Topology 2D | Node/link drag-drop, lưu JSON, seed từ devices |
| Settings UI | Form quét mạng + AD (frontend) |
| Static serve | Flask serve frontend, SPA fallback |

### 🚧 Đang / chưa hoàn thiện

| Hạng mục | Trạng thái | Ghi chú |
|----------|------------|---------|
| `/api/settings` GET/PUT | ❌ Chưa có backend | Frontend `api.getSettings()` / `updateSettings()` gọi nhưng 404 |
| `/api/activity/recent` | ❌ Chưa có backend | Dashboard activity table trả empty |
| User management API | ❌ Chưa có | Settings page dùng HTML tĩnh, `showAddUserModal()` chỉ toast |
| Scan method (ARP/TCP) | ⚠️ UI only | `#scan-method` chưa gửi lên API |
| Background auto-scan | ⚠️ Code có | `NetworkScanner.start_background_scan()` chưa được gọi từ app |
| Pagination devices | ⚠️ UI placeholder | `#device-pagination` chưa implement |
| Global search top bar | ⚠️ UI only | Input chưa bind logic |
| Notification bell | ⚠️ UI static | Badge "3" hardcoded |

### 📋 Gợi ý bước tiếp theo (ưu tiên)

1. Implement `/api/settings` — lưu `settings.json`, đồng bộ với `config.py`
2. Implement `/api/activity/recent` — log hành động remote/scan vào file
3. User CRUD API — tích hợp `AuthManager.list_users()` / `register_user()`
4. Wire scan-method selector → backend scan params
5. Kích hoạt background scan từ settings

---

## 5. Quy ước code

### Backend (Python)

- Module pattern: class + `init_app(app)`, gắn vào `app.scanner`, `app.auth_manager`, ...
- Decorators: `@token_required`, `@admin_required` từ `modules.auth`
- Response: luôn `jsonify({"success": True/False, ...})`
- Config: đọc từ `config.py` / env vars, không hardcode secret production
- Logging: `logging.getLogger(__name__)`

### Frontend (JavaScript)

- **Không dùng demo data** — comment trong `app.js` line 4
- State tập trung trong object `App`
- API qua singleton `api` (class `APIClient`)
- DOM id: kebab-case (`device-search`, `stat-total`)
- Toast: `App.toast(message, 'success'|'error'|'warning'|'info')`
- Escape HTML: `App.escapeHtml()` khi render user input
- LocalStorage keys: `auth_token`, `user_data`, `login_mode`, `login_domain`

### CSS

- Dark theme, CSS variables trong `:root` (`--cyan`, `--green-light`, ...)
- Class naming: BEM-like (`stat-card`, `nav-item`, `btn-primary`)

### Ngôn ngữ

- UI labels: **Tiếng Việt**
- Code comments: English hoặc Tiếng Việt (theo file hiện có)
- Commit message: English ngắn gọn

---

## 6. API Routes (Backend hiện có)

| Method | Route | Auth | Mô tả |
|--------|-------|------|-------|
| POST | `/api/auth/login` | - | `{username, password, mode, domain}` |
| POST | `/api/auth/logout` | - | Clear session |
| GET | `/api/auth/check` | token | Kiểm tra session |
| GET | `/api/network/scan` | token | `?start_ip&end_ip&timeout` |
| POST | `/api/network/scan/custom` | token | Body IP range |
| GET | `/api/network/device/<ip>/details` | token | Chi tiết thiết bị |
| GET | `/api/devices` | token | List cache |
| GET | `/api/devices/stats` | token | Dashboard stats |
| POST | `/api/devices/<ip>/remote` | token | Execute command |
| POST | `/api/devices/<ip>/remote/desktop` | token | RDP |
| POST | `/api/devices/<ip>/software/install` | admin | Cài SW |
| POST | `/api/devices/<ip>/software/uninstall` | admin | Gỡ SW |
| POST | `/api/devices/<ip>/files/copy` | admin | Copy file |
| POST | `/api/devices/<ip>/firewall/toggle` | admin | Firewall |
| POST | `/api/devices/<ip>/update/windows-update` | admin | Win Update |
| GET | `/api/devices/<ip>/system-info` | token | System info WMI |
| GET | `/api/ad/computers` | token | AD computers |
| GET | `/api/ad/users` | token | AD users |
| GET | `/api/ad/groups` | token | AD groups |
| GET | `/api/ad/search` | token | `?q=` |
| GET | `/api/ad/computer/<name>/detail` | token | AD computer detail |
| GET/POST | `/api/topology` | token | Sơ đồ mạng |

---

## 7. Trang SPA (Hash routes)

| Hash | Page ID | Load function |
|------|---------|---------------|
| `#dashboard` | `page-dashboard` | `App.loadDashboard()` |
| `#devices` | `page-devices` | `App.loadDevices()` |
| `#topology` | `page-topology` | `App.loadTopologyPage()` |
| `#scan` | `page-scan` | (form only) |
| `#remote` | `page-remote` | `App.loadRemoteDevices()` |
| `#ad` | `page-ad` | `App.loadADComputers()` |
| `#settings` | `page-settings` | `App.loadSettings()` |

---

## 8. Cách cập nhật file này

Khi hoàn thành tính năng mới:

1. Di chuyển mục từ **🚧** sang **✅** trong mục 4
2. Thêm biến/ID mới vào `.cursor/VARIABLES.md`
3. Thêm API route vào bảng mục 6 nếu có endpoint mới
4. Ghi ngày cập nhật ở đầu mục 4
