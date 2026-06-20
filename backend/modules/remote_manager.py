"""
Remote management module for IT Dashboard.
Provides Windows remote management capabilities using WMI, PsExec,
and other Windows-native tools via subprocess.
"""

import logging
import os
import subprocess
import tempfile
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class RemoteManager:
    """Manages remote operations on Windows devices via WMI and PsExec."""

    def __init__(self, app=None):
        self.app = app
        self.psexec_path = "PsExec.exe"
        self.wmic_timeout = 30

        if app:
            self.init_app(app)

    def init_app(self, app):
        """Initialize with Flask app configuration."""
        self.app = app
        self.psexec_path = app.config.get("PSEXEC_PATH", r"C:\PsTools\PsExec.exe")
        self.wmic_timeout = app.config.get("WMIC_TIMEOUT", 30)
        self.rdp_domain = app.config.get("RDP_DOMAIN", "")
        self.rdp_resolution = app.config.get("RDP_RESOLUTION", "1920x1080")

    def _run_command(self, cmd, timeout=None):
        """
        Run a subprocess command and return structured result.

        Args:
            cmd: Command list
            timeout: Timeout in seconds

        Returns:
            dict with returncode, stdout, stderr
        """
        if timeout is None:
            timeout = self.wmic_timeout

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                encoding="utf-8",
                errors="replace",
            )
            return {
                "returncode": result.returncode,
                "stdout": result.stdout.strip(),
                "stderr": result.stderr.strip(),
            }
        except subprocess.TimeoutExpired:
            return {
                "returncode": -1,
                "stdout": "",
                "stderr": "Command timed out",
            }
        except FileNotFoundError:
            return {
                "returncode": -1,
                "stdout": "",
                "stderr": f"Command not found: {cmd[0]}",
            }
        except OSError as e:
            return {
                "returncode": -1,
                "stdout": "",
                "stderr": f"OS error: {str(e)}",
            }

    def execute_command(self, ip, command, credentials=None):
        """
        Execute a command on a remote Windows machine via WMI.

        Args:
            ip: Target IP address
            command: Command to execute
            credentials: Optional dict with username/password

        Returns:
            dict with execution result
        """
        logger.info("Executing remote command on %s: %s", ip, command)

        # Use WMI to create process on remote machine
        wmic_cmd = [
            "wmic",
            f"/node:{ip}",
            "process",
            "call",
            "create",
            command,
        ]

        # Add credentials if provided
        if credentials:
            wmic_cmd.insert(2, f"/user:{credentials['username']}")
            wmic_cmd.insert(3, f"/password:{credentials['password']}")

        result = self._run_command(wmic_cmd, timeout=self.wmic_timeout)

        return {
            "success": result["returncode"] == 0,
            "ip": ip,
            "command": command,
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "returncode": result["returncode"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_system_info(self, ip, credentials=None):
        """
        Get comprehensive system information via WMI.

        Args:
            ip: Target IP address
            credentials: Optional credentials dict

        Returns:
            dict with system info (CPU, RAM, OS, disks, etc.)
        """
        info = {
            "ip": ip,
            "cpu": "",
            "os": "",
            "ram_total_gb": 0,
            "ram_free_gb": 0,
            "hostname": "",
            "disks": [],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            # Get OS info
            os_result = self._wmic_query(
                ip, "os", "Caption,Version,BuildNumber,OSArchitecture",
                credentials=credentials,
            )
            if os_result["success"]:
                info["os"] = os_result["data"].get("Caption", "Unknown")
                info["os_version"] = os_result["data"].get("Version", "")
                info["os_build"] = os_result["data"].get("BuildNumber", "")
                info["os_arch"] = os_result["data"].get("OSArchitecture", "")

            # Get CPU info
            cpu_result = self._wmic_query(
                ip, "cpu", "Name,NumberOfCores,NumberOfLogicalProcessors,LoadPercentage",
                credentials=credentials,
            )
            if cpu_result["success"]:
                info["cpu"] = cpu_result["data"].get("Name", "Unknown")
                info["cpu_cores"] = cpu_result["data"].get("NumberOfCores", "0")
                info["cpu_threads"] = cpu_result["data"].get("NumberOfLogicalProcessors", "0")
                info["cpu_usage"] = cpu_result["data"].get("LoadPercentage", "0")

            # Get RAM info
            mem_result = self._wmic_query(
                ip, "os", "TotalVisibleMemorySize,FreePhysicalMemory",
                credentials=credentials,
            )
            if mem_result["success"]:
                total_kb = int(mem_result["data"].get("TotalVisibleMemorySize", 0))
                free_kb = int(mem_result["data"].get("FreePhysicalMemory", 0))
                info["ram_total_gb"] = round(total_kb / 1048576, 2)
                info["ram_free_gb"] = round(free_kb / 1048576, 2)
                info["ram_used_gb"] = round((total_kb - free_kb) / 1048576, 2)

            # Get computer name
            cs_result = self._wmic_query(
                ip, "computersystem", "Name,Domain,Manufacturer,Model",
                credentials=credentials,
            )
            if cs_result["success"]:
                info["hostname"] = cs_result["data"].get("Name", ip)
                info["domain"] = cs_result["data"].get("Domain", "")
                info["manufacturer"] = cs_result["data"].get("Manufacturer", "")
                info["model"] = cs_result["data"].get("Model", "")

            # Get disk info
            disk_result = self._wmic_query(
                ip, "logicaldisk", "DeviceID,Size,FreeSpace,FileSystem",
                credentials=credentials,
            )
            if disk_result["success"] and disk_result.get("data_list"):
                for disk in disk_result["data_list"]:
                    size_gb = round(int(disk.get("Size", 0)) / 1073741824, 2)
                    free_gb = round(int(disk.get("FreeSpace", 0)) / 1073741824, 2)
                    info["disks"].append({
                        "drive": disk.get("DeviceID", ""),
                        "total_gb": size_gb,
                        "free_gb": free_gb,
                        "used_gb": round(size_gb - free_gb, 2),
                        "filesystem": disk.get("FileSystem", ""),
                    })

            # Get logged-in user
            user_info = self.get_logged_user(ip, credentials=credentials)
            info["logged_user"] = user_info.get("username", "")

        except Exception as e:
            logger.error("Error getting system info for %s: %s", ip, e)
            info["error"] = str(e)

        return info

    def _wmic_query(self, ip, wmi_class, fields, credentials=None):
        """
        Execute a WMI query and parse results.

        Args:
            ip: Target IP
            wmi_class: WMI class to query
            fields: Comma-separated fields
            credentials: Optional credentials

        Returns:
            dict with parsed results
        """
        wmic_cmd = [
            "wmic",
            f"/node:{ip}",
            wmi_class,
            "get",
            fields,
            "/format:list",
        ]

        if credentials:
            wmic_cmd.insert(2, f"/user:{credentials['username']}")
            wmic_cmd.insert(3, f"/password:{credentials['password']}")

        result = self._run_command(wmic_cmd, timeout=self.wmic_timeout)

        if result["returncode"] != 0:
            return {
                "success": False,
                "error": result["stderr"],
                "data": {},
            }

        # Parse key=value output
        data = {}
        data_list = []
        current_entry = {}

        for line in result["stdout"].splitlines():
            line = line.strip()
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip()
                if key and current_entry:
                    # If we already have data in current_entry and hit a duplicate key,
                    # start a new entry
                    pass
                data[key] = value
                current_entry[key] = value
            elif line == "" and current_entry:
                # Blank line separates entries in list format
                if current_entry:
                    data_list.append(current_entry)
                    current_entry = {}

        if current_entry:
            data_list.append(current_entry)

        return {
            "success": True,
            "data": data,
            "data_list": data_list if data_list else [data],
        }

    def get_logged_user(self, ip, credentials=None):
        """
        Get the currently logged-in user on a remote machine.

        Args:
            ip: Target IP
            credentials: Optional credentials

        Returns:
            dict with username info
        """
        try:
            result = self._wmic_query(
                ip, "computersystem", "UserName",
                credentials=credentials,
            )
            if result["success"]:
                username = result["data"].get("UserName", "")
                return {"success": True, "username": username, "ip": ip}
        except Exception as e:
            logger.error("Error getting logged user for %s: %s", ip, e)

        return {"success": False, "username": "", "ip": ip, "error": "Failed to query"}

    def install_software(self, ip, installer_path, credentials=None):
        """
        Install software on a remote machine using PsExec.

        Args:
            ip: Target IP
            installer_path: Path to installer on remote machine or local UNC path
            credentials: Optional credentials

        Returns:
            dict with installation result
        """
        logger.info("Installing software on %s: %s", ip, installer_path)

        # Use PsExec for silent install
        cmd = [
            self.psexec_path,
            f"\\\\{ip}",
            "-accepteula",
            "-nobanner",
            "-d",  # Don't wait
            "cmd.exe",
            "/c",
            f'"{installer_path}" /S /quiet',
        ]

        if credentials:
            cmd.insert(3, f"-u{credentials['username']}")
            cmd.insert(4, f"-p{credentials['password']}")

        result = self._run_command(cmd, timeout=60)

        return {
            "success": result["returncode"] == 0,
            "ip": ip,
            "installer": installer_path,
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def uninstall_software(self, ip, product_name, credentials=None):
        """
        Uninstall software on a remote machine via WMI.

        Args:
            ip: Target IP
            product_name: Name or partial name of the product
            credentials: Optional credentials

        Returns:
            dict with uninstall result
        """
        logger.info("Uninstalling software on %s: %s", ip, product_name)

        # First, find the product
        wmic_cmd = [
            "wmic",
            f"/node:{ip}",
            "product",
            "where",
            f"name like '%{product_name}%'",
            "call",
            "uninstall",
            "/nointeractive",
        ]

        if credentials:
            wmic_cmd.insert(2, f"/user:{credentials['username']}")
            wmic_cmd.insert(3, f"/password:{credentials['password']}")

        result = self._run_command(wmic_cmd, timeout=120)

        return {
            "success": result["returncode"] == 0 and "ReturnValue = 0" in result["stdout"],
            "ip": ip,
            "product_name": product_name,
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def copy_file(self, ip, local_path, remote_path, credentials=None):
        """
        Copy a file to/from a remote machine using copy command or UNC path.

        Args:
            ip: Target IP
            local_path: Local file path
            remote_path: Remote file path
            credentials: Optional credentials

        Returns:
            dict with copy result
        """
        logger.info("Copying file to %s: %s -> %s", ip, local_path, remote_path)

        # Build the copy command using WMI process creation
        copy_cmd = f'copy "{local_path}" "\\\\{ip}\\{remote_path}"'
        if credentials:
            # Use net use to authenticate first
            net_use_cmd = f'net use "\\\\{ip}\\{remote_path.rsplit(chr(92), 1)[0]}" /user:{credentials["username"]} {credentials["password"]}'
            # Then copy, then disconnect
            full_cmd = f'{net_use_cmd} && {copy_cmd} && net use "\\\\{ip}\\{remote_path.rsplit(chr(92), 1)[0]}" /delete'
        else:
            full_cmd = copy_cmd

        result = self.execute_command(ip, full_cmd, credentials=credentials)

        return {
            "success": result["success"],
            "ip": ip,
            "local_path": local_path,
            "remote_path": remote_path,
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def toggle_firewall(self, ip, enable, credentials=None):
        """
        Enable or disable Windows Firewall on a remote machine.

        Args:
            ip: Target IP
            enable: True to enable, False to disable
            credentials: Optional credentials

        Returns:
            dict with result
        """
        state = "enable" if enable else "disable"
        logger.info("Setting firewall %s on %s", state, ip)

        # Use WMI to set firewall state
        if enable:
            # Enable firewall for all profiles
            cmd = (
                'netsh advfirewall set allprofiles state on'
            )
        else:
            cmd = (
                'netsh advfirewall set allprofiles state off'
            )

        result = self.execute_command(ip, cmd, credentials=credentials)

        return {
            "success": result["success"],
            "ip": ip,
            "firewall_enabled": enable,
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def trigger_windows_update(self, ip, credentials=None):
        """
        Trigger Windows Update on a remote machine via WMI.

        Args:
            ip: Target IP
            credentials: Optional credentials

        Returns:
            dict with update trigger result
        """
        logger.info("Triggering Windows Update on %s", ip)

        # Use WMI to trigger Windows Update
        # Create an UpdateSearcher via WMI command line
        cmd = (
            'powershell -Command "'
            "$u = New-Object -ComObject Microsoft.Update.Session; "
            "$s = $u.CreateUpdateSearcher(); "
            "$r = $s.Search('IsInstalled=0'); "
            "Write-Host ('Updates available: ' + $r.Updates.Count); "
            "$dl = New-Object -ComObject Microsoft.Update.UpdateColl; "
            "foreach($u in $r.Updates) { $dl.Add($u) | Out-Null }; "
            "$i = $u.CreateUpdateInstaller(); "
            "$i.Install($dl) | Out-Null; "
            'Write-Host "Update process initiated"'
            '"'
        )

        result = self.execute_command(ip, cmd, credentials=credentials)

        return {
            "success": result["success"],
            "ip": ip,
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_open_ports(self, ip, credentials=None):
        """
        Get list of listening ports on a remote machine.

        Args:
            ip: Target IP
            credentials: Optional credentials

        Returns:
            dict with list of open ports
        """
        cmd = 'netstat -an | findstr "LISTENING"'

        result = self.execute_command(ip, cmd, credentials=credentials)

        ports = []
        if result["success"]:
            for line in result["stdout"].splitlines():
                parts = line.split()
                if len(parts) >= 4:
                    local_addr = parts[3]
                    if ":" in local_addr:
                        port = local_addr.rsplit(":", 1)[1]
                        try:
                            ports.append({
                                "port": int(port),
                                "address": local_addr,
                                "protocol": parts[0],
                                "state": parts[3] if len(parts) > 3 else "",
                            })
                        except ValueError:
                            pass

        # Deduplicate by port
        seen = set()
        unique_ports = []
        for p in ports:
            if p["port"] not in seen:
                seen.add(p["port"])
                unique_ports.append(p)

        return {
            "success": result["success"],
            "ip": ip,
            "ports": sorted(unique_ports, key=lambda x: x["port"]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_running_services(self, ip, credentials=None):
        """
        Get list of running services on a remote machine.

        Args:
            ip: Target IP
            credentials: Optional credentials

        Returns:
            dict with list of services
        """
        wmic_cmd = [
            "wmic",
            f"/node:{ip}",
            "service",
            "where",
            "State='Running'",
            "get",
            "Name,DisplayName,ProcessId,StartMode",
            "/format:list",
        ]

        if credentials:
            wmic_cmd.insert(2, f"/user:{credentials['username']}")
            wmic_cmd.insert(3, f"/password:{credentials['password']}")

        result = self._run_command(wmic_cmd, timeout=self.wmic_timeout)

        services = []
        if result["returncode"] == 0:
            current_service = {}
            for line in result["stdout"].splitlines():
                line = line.strip()
                if "=" in line:
                    key, _, value = line.partition("=")
                    current_service[key.strip()] = value.strip()
                elif line == "" and current_service:
                    if current_service.get("Name"):
                        services.append(current_service.copy())
                    current_service = {}
            if current_service and current_service.get("Name"):
                services.append(current_service)

        return {
            "success": result["returncode"] == 0,
            "ip": ip,
            "services": services,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def generate_rdp_file(self, ip, username=None, domain=None):
        """
        Generate .rdp file content for connecting to a remote machine.

        Args:
            ip: Target IP
            username: Username for RDP connection
            domain: Domain for RDP connection

        Returns:
            dict with RDP file content and metadata
        """
        domain = domain or self.rdp_domain
        resolution = self.rdp_resolution.split("x")
        width = resolution[0] if len(resolution) > 0 else "1920"
        height = resolution[1] if len(resolution) > 1 else "1080"

        rdp_content = f"""screen mode id:i:2
use multimon:i:0
desktopwidth:i:{width}
desktopheight:i:{height}
session bpp:i:32
winposv:i:0,1,0,0,1920,1080
compression:i:1
keyboardhook:i:2
audiocapturemode:i:0
videoplaybackmode:i:1
connection type:i:7
networkautodetect:i:1
bandwidthautodetect:i:1
displayconnectionbar:i:1
enableworkspacereconnect:i:0
disable wallpaper:i:0
allow font smoothing:i:0
allow desktop composition:i:0
disable full window drag:i:1
disable menu anims:i:1
disable themes:i:0
disable cursor setting:i:0
bitmapcachepersistenable:i:1
full address:s:{ip}
username:s:{username or "Administrator"}
drivestoredirect:s:"""

        if domain:
            rdp_content += f"\ndomain:s:{domain}"

        # Add authentication level
        rdp_content += "\nauthentication level:i:0"
        rdp_content += "\nprompt for credentials:i:1"
        rdp_content += "\nautoreconnection enabled:i:1"

        return {
            "success": True,
            "rdp_content": rdp_content,
            "ip": ip,
            "username": username or "Administrator",
            "filename": f"{ip.replace('.', '_')}.rdp",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
