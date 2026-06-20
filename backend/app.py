"""
IT Dashboard - Main Flask Application
Backend API server for network management, remote administration,
and Active Directory integration.
"""

import logging
import os
import sys
import json
from datetime import datetime, timezone

from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from flask_session import Session

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import get_config
from modules.auth import AuthManager, token_required, admin_required
from modules.network_scanner import NetworkScanner
from modules.remote_manager import RemoteManager
from modules.ad_integration import ADIntegration


def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__, static_folder=None)

    # Load configuration
    config = get_config()
    app.config.from_object(config)

    # Enable CORS
    CORS(app, supports_credentials=True)

    # Initialize session
    Session(app)

    # Setup logging
    log_level = getattr(logging, config.LOG_LEVEL.upper(), logging.INFO)
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(config.LOG_FILE, encoding="utf-8"),
        ],
    )
    logger = logging.getLogger("dashboard")

    # Initialize modules
    auth_manager = AuthManager()
    auth_manager.init_app(app)
    app.auth_manager = auth_manager

    scanner = NetworkScanner()
    scanner.init_app(app)
    app.scanner = scanner

    remote_mgr = RemoteManager()
    remote_mgr.init_app(app)
    app.remote_manager = remote_mgr

    ad = ADIntegration()
    ad.init_app(app)
    app.ad = ad

    logger.info("IT Dashboard backend initialized")

    # ========================================================================
    # STATIC FILES - Serve frontend
    # ========================================================================

    @app.route("/")
    def serve_index():
        """Serve the frontend index.html."""
        frontend_dir = app.config.get("FRONTEND_DIR", "../frontend")
        index_path = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_path):
            return send_from_directory(frontend_dir, "index.html")
        return jsonify({"message": "IT Dashboard API is running", "version": "1.0.0"}), 200

    @app.route("/<path:path>")
    def serve_static(path):
        """Serve static frontend files."""
        frontend_dir = app.config.get("FRONTEND_DIR", "../frontend")
        file_path = os.path.join(frontend_dir, path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return send_from_directory(frontend_dir, path)
        # Fallback to index for SPA routing
        index_path = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_path):
            return send_from_directory(frontend_dir, "index.html")
        return jsonify({"error": "Not found"}), 404

    # ========================================================================
    # AUTH ROUTES
    # ========================================================================

    @app.route("/api/auth/login", methods=["POST"])
    def login():
        """
        Login with credentials.
        Body: { "username": "...", "password": "..." }
        """
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "message": "No data provided"}), 400

        username = data.get("username", "").strip()
        password = data.get("password", "")

        if not username or not password:
            return jsonify({"success": False, "message": "Username and password required"}), 400

        result = auth_manager.authenticate(username, password)

        if result["success"]:
            session["token"] = result["token"]
            session["username"] = username

        status_code = 200 if result["success"] else 401
        return jsonify(result), status_code

    @app.route("/api/auth/logout", methods=["POST"])
    def logout():
        """Logout and clear session."""
        session.clear()
        return jsonify({"success": True, "message": "Logged out successfully"})

    @app.route("/api/auth/check", methods=["GET"])
    @token_required
    def auth_check():
        """Check if current session/token is still valid."""
        username = request.user.get("username", "")
        user_info = auth_manager.get_user_info(username)
        return jsonify({
            "success": True,
            "authenticated": True,
            "user": user_info or {"username": username},
        })

    # ========================================================================
    # NETWORK ROUTES
    # ========================================================================

    @app.route("/api/network/scan", methods=["GET"])
    @token_required
    def network_scan():
        """
        Scan an IP range.
        Query params: start_ip, end_ip, timeout (optional)
        """
        start_ip = request.args.get("start_ip", "")
        end_ip = request.args.get("end_ip", "")
        timeout = request.args.get("timeout", type=int)

        if not start_ip or not end_ip:
            return jsonify({"success": False, "message": "start_ip and end_ip are required"}), 400

        result = scanner.scan_range(start_ip, end_ip, timeout=timeout)
        status_code = 200 if result.get("success") else 400
        return jsonify(result), status_code

    @app.route("/api/network/device/<ip>/details", methods=["GET"])
    @token_required
    def network_device_details(ip):
        """Get detailed info for a specific device (ports, OS info)."""
        details = scanner.get_device_details(ip)
        return jsonify({"success": True, "device": details})

    @app.route("/api/network/scan/custom", methods=["POST"])
    @token_required
    def network_scan_custom():
        """
        Custom network scan with user-defined IP range.
        Body: { "start_ip": "...", "end_ip": "...", "ports": [22,80,...] (optional) }
        """
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "message": "No data provided"}), 400

        start_ip = data.get("start_ip", "")
        end_ip = data.get("end_ip", "")

        if not start_ip or not end_ip:
            return jsonify({"success": False, "message": "start_ip and end_ip are required"}), 400

        result = scanner.scan_range(start_ip, end_ip)
        status_code = 200 if result.get("success") else 400
        return jsonify(result), status_code

    # ========================================================================
    # DEVICE ROUTES
    # ========================================================================

    @app.route("/api/devices", methods=["GET"])
    @token_required
    def list_devices():
        """List all discovered devices from cache."""
        devices = scanner.get_all_devices()
        return jsonify({"success": True, "devices": devices, "count": len(devices)})

    @app.route("/api/devices/stats", methods=["GET"])
    @token_required
    def device_stats():
        """Dashboard statistics (total, online, offline, by type)."""
        stats = scanner.get_stats()
        return jsonify({"success": True, "stats": stats})

    @app.route("/api/devices/<ip>/remote", methods=["POST"])
    @token_required
    def device_remote_exec(ip):
        """
        Execute command on remote device.
        Body: { "command": "...", "username": "..." (optional), "password": "..." (optional) }
        """
        data = request.get_json()
        if not data or not data.get("command"):
            return jsonify({"success": False, "message": "Command is required"}), 400

        credentials = None
        if data.get("username") and data.get("password"):
            credentials = {"username": data["username"], "password": data["password"]}

        result = remote_mgr.execute_command(ip, data["command"], credentials=credentials)
        return jsonify(result)

    @app.route("/api/devices/<ip>/remote/desktop", methods=["POST"])
    @token_required
    def device_rdp(ip):
        """
        Generate RDP connection info.
        Body: { "username": "..." (optional), "domain": "..." (optional) }
        """
        data = request.get_json() or {}
        username = data.get("username", "")
        domain = data.get("domain", "")

        result = remote_mgr.generate_rdp_file(ip, username=username, domain=domain)
        return jsonify(result)

    @app.route("/api/devices/<ip>/software/install", methods=["POST"])
    @admin_required
    def device_software_install(ip):
        """
        Install software on remote device.
        Body: { "installer_path": "...", "username": "...", "password": "..." }
        """
        data = request.get_json()
        if not data or not data.get("installer_path"):
            return jsonify({"success": False, "message": "installer_path is required"}), 400

        credentials = None
        if data.get("username") and data.get("password"):
            credentials = {"username": data["username"], "password": data["password"]}

        result = remote_mgr.install_software(ip, data["installer_path"], credentials=credentials)
        return jsonify(result)

    @app.route("/api/devices/<ip>/software/uninstall", methods=["POST"])
    @admin_required
    def device_software_uninstall(ip):
        """
        Uninstall software on remote device.
        Body: { "product_name": "...", "username": "...", "password": "..." }
        """
        data = request.get_json()
        if not data or not data.get("product_name"):
            return jsonify({"success": False, "message": "product_name is required"}), 400

        credentials = None
        if data.get("username") and data.get("password"):
            credentials = {"username": data["username"], "password": data["password"]}

        result = remote_mgr.uninstall_software(ip, data["product_name"], credentials=credentials)
        return jsonify(result)

    @app.route("/api/devices/<ip>/files/copy", methods=["POST"])
    @admin_required
    def device_file_copy(ip):
        """
        Copy file to/from remote device.
        Body: { "local_path": "...", "remote_path": "...", "username": "...", "password": "..." }
        """
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "message": "Data is required"}), 400

        local_path = data.get("local_path", "")
        remote_path = data.get("remote_path", "")

        if not local_path or not remote_path:
            return jsonify({"success": False, "message": "local_path and remote_path are required"}), 400

        credentials = None
        if data.get("username") and data.get("password"):
            credentials = {"username": data["username"], "password": data["password"]}

        result = remote_mgr.copy_file(ip, local_path, remote_path, credentials=credentials)
        return jsonify(result)

    @app.route("/api/devices/<ip>/firewall/toggle", methods=["POST"])
    @admin_required
    def device_firewall_toggle(ip):
        """
        Enable/disable firewall on remote device.
        Body: { "enable": true/false, "username": "...", "password": "..." }
        """
        data = request.get_json()
        if not data or "enable" not in data:
            return jsonify({"success": False, "message": "enable field is required"}), 400

        credentials = None
        if data.get("username") and data.get("password"):
            credentials = {"username": data["username"], "password": data["password"]}

        result = remote_mgr.toggle_firewall(ip, data["enable"], credentials=credentials)
        return jsonify(result)

    @app.route("/api/devices/<ip>/update/windows-update", methods=["POST"])
    @admin_required
    def device_windows_update(ip):
        """
        Trigger Windows Update on remote device.
        Body: { "username": "...", "password": "..." }
        """
        data = request.get_json() or {}

        credentials = None
        if data.get("username") and data.get("password"):
            credentials = {"username": data["username"], "password": data["password"]}

        result = remote_mgr.trigger_windows_update(ip, credentials=credentials)
        return jsonify(result)

    @app.route("/api/devices/<ip>/system-info", methods=["GET"])
    @token_required
    def device_system_info(ip):
        """Get full system info (CPU, RAM, OS, logged-in user, etc.)."""
        credentials = None
        username = request.args.get("username")
        password = request.args.get("password")
        if username and password:
            credentials = {"username": username, "password": password}

        result = remote_mgr.get_system_info(ip, credentials=credentials)
        return jsonify(result)

    # ========================================================================
    # ACTIVE DIRECTORY ROUTES
    # ========================================================================

    @app.route("/api/ad/computers", methods=["GET"])
    @token_required
    def ad_computers():
        """List computers from Active Directory."""
        ou = request.args.get("ou")
        computers = ad.get_ad_computers(ou=ou)
        return jsonify({"success": True, "computers": computers, "count": len(computers)})

    @app.route("/api/ad/users", methods=["GET"])
    @token_required
    def ad_users():
        """List users from Active Directory."""
        ou = request.args.get("ou")
        users = ad.get_ad_users(ou=ou)
        return jsonify({"success": True, "users": users, "count": len(users)})

    @app.route("/api/ad/groups", methods=["GET"])
    @token_required
    def ad_groups():
        """List groups from Active Directory."""
        groups = ad.get_ad_groups()
        return jsonify({"success": True, "groups": groups, "count": len(groups)})

    @app.route("/api/ad/search", methods=["GET"])
    @token_required
    def ad_search():
        """
        Search AD by employee ID or name.
        Query params: q (search query)
        """
        query = request.args.get("q", "").strip()
        if not query:
            return jsonify({"success": False, "message": "Search query (q) is required"}), 400

        result = ad.search_ad(query)
        return jsonify(result)

    @app.route("/api/ad/computer/<name>/detail", methods=["GET"])
    @token_required
    def ad_computer_detail(name):
        """Get computer detail including join date and group membership."""
        result = ad.get_computer_detail(name)
        status_code = 200 if result.get("success") else 404
        return jsonify(result), status_code

    # ========================================================================
    # ERROR HANDLERS
    # ========================================================================

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"success": False, "message": "Endpoint not found"}), 404

    @app.errorhandler(500)
    def internal_error(e):
        logger.error("Internal server error: %s", e)
        return jsonify({"success": False, "message": "Internal server error"}), 500

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"success": False, "message": "Method not allowed"}), 405

    return app


# Application entry point
app = create_app()

if __name__ == "__main__":
    config = get_config()
    print(f"Starting IT Dashboard on {config.HOST}:{config.PORT}")
    app.run(
        host=config.HOST,
        port=config.PORT,
        debug=config.DEBUG,
    )
