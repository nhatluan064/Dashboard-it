# 🖥️ IT Dashboard Management System

Hệ thống giám sát và quản lý mạng nội bộ — chạy trên Localhost trong mạng công ty.

## 📸 Tính năng chính

| Tính năng | Mô tả |
|-----------|-------|
| 🔐 **Đăng nhập** | Xác thực Local Windows Admin, JWT token, bcrypt |
| 📊 **Dashboard** | Biểu đồ Online/Offline, loại thiết bị, hoạt động gần đây |
| 🖥️ **Thiết bị** | Danh sách realtime (30s auto-refresh), tìm kiếm, lọc |
| 🔍 **Quét mạng** | Nhập dải IP tùy ý, Ping Sweep, progress bar |
| ⚡ **Remote Control** | Terminal WMI, Remote Desktop (RDP) |
| 👥 **Active Directory** | Computers/Users/Groups, tìm kiếm theo mã NV |
| ⚙️ **Cài đặt** | Cấu hình quét mạng, AD Server, quản lý user |

## 🚀 Cài đặt & Chạy

### Yêu cầu
- Python 3.12+
- Windows 10/11 (dùng WMI, PsExec cho remote management)

### Cài dependencies
```bash
cd backend
pip install -r requirements.txt
```

### Chạy server
```bash
cd backend
python app.py
```

Mở trình duyệt: **http://127.0.0.1:5000**

> Lần đầu đăng nhập, user sẽ tự động đăng ký làm Admin.

### Cấu hình Active Directory (tùy chọn)
Set environment variables:
```bash
set AD_SERVER=ldap://192.168.x.x
set AD_BASE_DN=DC=company,DC=local
set AD_BIND_DN=CN=admin,DC=company,DC=local
set AD_BIND_PASSWORD=your_password
```

## 📁 Cấu trúc dự án

```
Dashboard-it/
├── backend/
│   ├── app.py                    # Flask API (23 routes)
│   ├── config.py                 # Cấu hình
│   ├── modules/
│   │   ├── auth.py               # Xác thực Windows Local
│   │   ├── network_scanner.py    # ICMP, ARP, Port Scan
│   │   ├── remote_manager.py     # WMI/PsExec remote
│   │   └── ad_integration.py     # Active Directory LDAP
│   └── requirements.txt
├── frontend/
│   ├── index.html                # SPA HTML
│   ├── css/style.css             # Dark theme UI
│   └── js/
│       ├── api.js                # API client
│       └── app.js                # App logic
└── .gitignore
```

## 🛠️ Tech Stack

- **Backend**: Python Flask, JWT, bcrypt, ldap3
- **Frontend**: Vanilla HTML/CSS/JS, Chart.js, Font Awesome
- **Remote Management**: WMI, PsExec, RDP
- **Network**: ICMP Ping, ARP, Socket Port Scan

## 📝 License

Internal Use Only — Dành cho sử dụng nội bộ công ty.
