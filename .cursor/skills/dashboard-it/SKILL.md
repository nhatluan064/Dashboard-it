---
name: dashboard-it
description: >-
  Develop and maintain the IT Dashboard Management System (Flask + Vanilla JS
  SPA). Use when working on Dashboard-it, IT Dashboard, network scanning, remote
  management, Active Directory integration, topology map, or when the user asks
  to add/fix features in this project.
---

# IT Dashboard — Agent Skill

## Bắt đầu mỗi session

1. Đọc [`PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md) — kiến trúc, tiến độ, quy ước
2. Tra cứu [`.cursor/VARIABLES.md`](../../VARIABLES.md) trước khi đặt tên biến mới
3. Không thêm demo/fake data — dự án dùng API thật

## Workflow khi nhận task

```
Task Progress:
- [ ] Đọc PROJECT_CONTEXT.md → xác định module liên quan
- [ ] Tra VARIABLES.md → dùng đúng tên field/id hiện có
- [ ] Sửa backend trước nếu cần API mới
- [ ] Cập nhật api.js method tương ứng
- [ ] Cập nhật app.js / index.html nếu cần UI
- [ ] Cập nhật VARIABLES.md + PROJECT_CONTEXT.md nếu thêm biến/route
```

## Thêm API endpoint mới

1. Route trong `backend/app.py` — prefix `/api/`, decorator `@token_required` hoặc `@admin_required`
2. Response format: `{"success": true/false, "message": "...", ...}`
3. Method tương ứng trong `frontend/js/api.js`
4. Gọi từ `App.*` trong `frontend/js/app.js`
5. Ghi vào VARIABLES.md section 9 và PROJECT_CONTEXT.md section 6

## Thêm trang SPA mới

1. `<div id="page-{name}" class="page">` trong `index.html`
2. Nav link: `<a href="#{name}" data-page="{name}">`
3. Thêm vào `App.navigateTo()` → `titles` object
4. Thêm case trong `loadPageData()` switch
5. CSS trong `style.css` theo pattern card/grid hiện có

## Module backend

| File | Khi nào sửa |
|------|-------------|
| `config.py` | Thêm env var / config mới |
| `modules/auth.py` | Login, JWT, user store |
| `modules/network_scanner.py` | Scan, device cache, stats |
| `modules/remote_manager.py` | WMI, PsExec, RDP, file copy |
| `modules/ad_integration.py` | LDAP queries |

Gắn module vào app qua `init_app(app)` pattern — xem `create_app()` trong `app.py`.

## Frontend patterns

```javascript
// Gọi API + xử lý lỗi
try {
    const data = await api.someMethod();
    const items = Array.isArray(data) ? data : (data.devices || []);
} catch (e) {
    this.toast('Lỗi: ' + e.message, 'error');
}

// Render table row — luôn escapeHtml cho user data
`<td>${this.escapeHtml(device.hostname)}</td>`

// Toast feedback
this.toast('Đã lưu', 'success');
```

## Device field mapping

Backend dùng `snake_case`. Frontend đọc cả alias:

- `reachable` hoặc `status === 'online'`
- `mac_address` hoặc `mac`
- `user_login` hoặc `logged_user`

Khi thêm field mới → thêm vào device schema trong VARIABLES.md section 3.

## Tiến độ — ưu tiên implement

Xem mục **🚧 Đang / chưa hoàn thiện** trong PROJECT_CONTEXT.md.

Endpoint thiếu phổ biến nhất:
- `GET/PUT /api/settings`
- `GET /api/activity/recent`
- User management CRUD

## Chạy & test

```bash
cd backend
pip install -r requirements.txt
python app.py
# → http://127.0.0.1:5000
```

Hoặc double-click `Start-Dashboard.bat` trên Windows.

## Không làm

- Không dùng framework frontend (React/Vue) — giữ Vanilla JS
- Không hardcode demo devices/users trong JS
- Không đổi tên biến hàng loạt nếu không được yêu cầu
- Không commit secrets (.env, AD password) vào git
- Không tạo file .md mới ngoài PROJECT_CONTEXT / VARIABLES trừ khi user yêu cầu

## Sau khi hoàn thành feature

1. Cập nhật tiến độ trong `PROJECT_CONTEXT.md` mục 4
2. Thêm biến/route vào `.cursor/VARIABLES.md`
3. Giữ diff tối thiểu — chỉ sửa file liên quan
