"""
Network scanning module for IT Dashboard.
Provides IP scanning, port scanning, ARP table parsing, and device discovery
using Windows subprocess commands and Python sockets.
"""

import ipaddress
import json
import logging
import os
import re
import socket
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class NetworkScanner:
    """Network scanning and device discovery engine."""

    def __init__(self, app=None):
        self.app = app
        self.cache_file = None
        self.device_cache = {}
        self.arp_table = {}
        self._lock = threading.Lock()
        self._scan_thread = None
        self._running = False
        self.scan_interval = 300  # seconds

        if app:
            self.init_app(app)

    def init_app(self, app):
        """Initialize with Flask app configuration."""
        self.app = app
        self.cache_file = app.config.get("DEVICE_CACHE_FILE", "devices_cache.json")
        self.scan_timeout = app.config.get("SCAN_TIMEOUT", 1000)
        self.max_workers = app.config.get("SCAN_MAX_WORKERS", 50)
        self.common_ports = app.config.get("COMMON_PORTS", [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 1723, 3389, 5900, 8080])
        self.scan_interval = app.config.get("SCAN_INTERVAL_SECONDS", 300)
        self._load_cache()

    def _load_cache(self):
        """Load device cache from file."""
        try:
            if os.path.exists(self.cache_file):
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    self.device_cache = json.load(f)
                logger.info("Loaded %d cached devices", len(self.device_cache))
        except (json.JSONDecodeError, IOError) as e:
            logger.warning("Failed to load device cache: %s", e)
            self.device_cache = {}

    def _save_cache(self):
        """Save device cache to file."""
        try:
            with self._lock:
                with open(self.cache_file, "w", encoding="utf-8") as f:
                    json.dump(self.device_cache, f, indent=2, default=str)
        except IOError as e:
            logger.error("Failed to save device cache: %s", e)

    def ping_host(self, ip, timeout=None):
        """
        Ping a host using Windows ping command.

        Args:
            ip: IP address to ping
            timeout: Timeout in ms (default from config)

        Returns:
            dict with ping result: {ip, hostname, reachable, response_time_ms}
        """
        if timeout is None:
            timeout = self.scan_timeout

        result = {
            "ip": ip,
            "hostname": "",
            "reachable": False,
            "response_time_ms": 0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            # Windows ping command
            cmd = ["ping", "-n", "1", "-w", str(timeout), ip]
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=(timeout / 1000) + 5,
                encoding="utf-8",
                errors="replace",
            )

            if proc.returncode == 0 and "TTL=" in proc.stdout:
                result["reachable"] = True

                # Parse response time
                time_match = re.search(r"time[=<](\d+)ms", proc.stdout, re.IGNORECASE)
                if time_match:
                    result["response_time_ms"] = int(time_match.group(1))

                # Try to resolve hostname
                try:
                    hostname = socket.gethostbyaddr(ip)
                    result["hostname"] = hostname[0]
                except (socket.herror, socket.gaierror):
                    result["hostname"] = ip

        except subprocess.TimeoutExpired:
            logger.debug("Ping timeout for %s", ip)
        except Exception as e:
            logger.debug("Ping failed for %s: %s", ip, e)

        return result

    def get_mac_address(self, ip):
        """
        Get MAC address for an IP from the ARP table.

        Args:
            ip: IP address

        Returns:
            MAC address string or empty string
        """
        try:
            result = subprocess.run(
                ["arp", "-a", ip],
                capture_output=True,
                text=True,
                timeout=5,
                encoding="utf-8",
                errors="replace",
            )
            if result.returncode == 0:
                # Parse ARP output - look for the MAC address line
                for line in result.stdout.splitlines():
                    if ip in line:
                        # Match MAC address pattern like aa-bb-cc-dd-ee-ff
                        mac_match = re.search(r"([0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2})", line)
                        if mac_match:
                            return mac_match.group(1).replace("-", ":").lower()
        except Exception as e:
            logger.debug("Failed to get MAC for %s: %s", ip, e)

        return ""

    def scan_ports(self, ip, ports=None, timeout=1):
        """
        Scan common ports on a target IP.

        Args:
            ip: Target IP address
            ports: List of ports to scan (default: common_ports)
            timeout: Socket timeout in seconds

        Returns:
            List of open ports with service info
        """
        if ports is None:
            ports = self.common_ports

        open_ports = []
        common_services = {
            21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP",
            53: "DNS", 80: "HTTP", 110: "POP3", 135: "RPC",
            139: "NetBIOS", 143: "IMAP", 443: "HTTPS",
            445: "SMB", 993: "IMAPS", 995: "POP3S",
            1723: "PPTP", 3389: "RDP", 5900: "VNC",
            8080: "HTTP-Proxy",
        }

        for port in ports:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(timeout)
                result = sock.connect_ex((ip, port))
                if result == 0:
                    open_ports.append({
                        "port": port,
                        "service": common_services.get(port, "unknown"),
                        "state": "open",
                    })
                sock.close()
            except (socket.error, OSError):
                pass

        return open_ports

    def get_arp_table(self):
        """
        Parse the system ARP table.

        Returns:
            dict mapping IP to MAC address
        """
        arp_entries = {}
        try:
            result = subprocess.run(
                ["arp", "-a"],
                capture_output=True,
                text=True,
                timeout=10,
                encoding="utf-8",
                errors="replace",
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    # Match lines like:  192.168.1.1    aa-bb-cc-dd-ee-ff    dynamic
                    match = re.match(
                        r"\s+([\d.]+)\s+([0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2})",
                        line,
                    )
                    if match:
                        ip_addr = match.group(1)
                        mac = match.group(2).replace("-", ":").lower()
                        arp_entries[ip_addr] = mac
        except Exception as e:
            logger.error("Failed to get ARP table: %s", e)

        self.arp_table = arp_entries
        return arp_entries

    def scan_range(self, start_ip, end_ip, timeout=None):
        """
        Scan a range of IP addresses in parallel.

        Args:
            start_ip: First IP in range
            end_ip: Last IP in range
            timeout: Ping timeout in ms

        Returns:
            List of discovered devices
        """
        if timeout is None:
            timeout = self.scan_timeout

        try:
            start = ipaddress.IPv4Address(start_ip)
            end = ipaddress.IPv4Address(end_ip)
        except ValueError as e:
            return {"success": False, "message": f"Invalid IP range: {e}"}

        # Generate IP list by iterating from start to end
        ip_list = []
        current = start
        while current <= end:
            ip_list.append(str(current))
            current = ipaddress.IPv4Address(int(current) + 1)

        # Limit range to prevent abuse
        if len(ip_list) > 1024:
            return {"success": False, "message": "IP range too large (max 1024 hosts)"}

        logger.info("Starting scan of %d IPs from %s to %s", len(ip_list), start_ip, end_ip)

        # Refresh ARP table first
        self.get_arp_table()

        discovered = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_ip = {
                executor.submit(self.get_device_info, ip): ip
                for ip in ip_list
            }

            for future in as_completed(future_to_ip):
                ip = future_to_ip[future]
                try:
                    device_info = future.result(timeout=(timeout / 1000) + 10)
                    if device_info and device_info.get("reachable"):
                        discovered.append(device_info)
                        # Update cache
                        with self._lock:
                            self.device_cache[ip] = device_info
                except Exception as e:
                    logger.debug("Scan failed for %s: %s", ip, e)

        # Sort by IP
        discovered.sort(key=lambda d: tuple(int(x) for x in d["ip"].split(".")))

        # Save updated cache
        self._save_cache()

        logger.info("Scan complete: %d devices found out of %d", len(discovered), len(ip_list))
        return {"success": True, "devices": discovered, "total_scanned": len(ip_list)}

    def get_device_info(self, ip):
        """
        Get comprehensive info for a single device.

        Args:
            ip: IP address to query

        Returns:
            dict with device info including ping, MAC, open ports
        """
        # Ping the host
        ping_result = self.ping_host(ip)

        device_info = {
            "ip": ip,
            "hostname": ping_result["hostname"],
            "reachable": ping_result["reachable"],
            "response_time_ms": ping_result["response_time_ms"],
            "mac_address": "",
            "open_ports": [],
            "type": "unknown",
            "last_seen": ping_result["timestamp"],
            "scan_timestamp": datetime.now(timezone.utc).isoformat(),
        }

        if ping_result["reachable"]:
            # Get MAC from ARP table
            device_info["mac_address"] = self.arp_table.get(ip, self.get_mac_address(ip))

            # Scan common ports
            device_info["open_ports"] = self.scan_ports(ip)

            # Classify device type based on open ports
            device_info["type"] = self._classify_device(device_info["open_ports"])

        return device_info

    def _classify_device(self, open_ports):
        """
        Classify device type based on open ports.

        Args:
            open_ports: List of open port dicts

        Returns:
            Device type string
        """
        port_numbers = {p["port"] for p in open_ports}

        if 3389 in port_numbers:
            return "windows-pc"
        if 22 in port_numbers and 80 not in port_numbers:
            return "linux-server"
        if 445 in port_numbers or 135 in port_numbers:
            return "windows-server"
        if 80 in port_numbers or 443 in port_numbers:
            return "web-server"
        if 21 in port_numbers:
            return "ftp-server"
        if 5900 in port_numbers:
            return "vnc-host"

        return "device"

    def get_all_devices(self):
        """Get all cached devices."""
        with self._lock:
            return list(self.device_cache.values())

    def get_device_by_ip(self, ip):
        """Get a specific device from cache."""
        with self._lock:
            return self.device_cache.get(ip)

    def get_stats(self):
        """
        Get dashboard statistics.

        Returns:
            dict with total, online, offline counts and type breakdown
        """
        with self._lock:
            devices = list(self.device_cache.values())

        total = len(devices)
        online = sum(1 for d in devices if d.get("reachable"))
        offline = total - online

        # Count by type
        by_type = {}
        for d in devices:
            dtype = d.get("type", "unknown")
            by_type[dtype] = by_type.get(dtype, 0) + 1

        return {
            "total": total,
            "online": online,
            "offline": offline,
            "by_type": by_type,
            "last_scan": devices[0].get("scan_timestamp", "") if devices else "",
        }

    def get_device_details(self, ip):
        """
        Get detailed information for a specific device.

        Args:
            ip: IP address

        Returns:
            dict with detailed device info including port scan
        """
        # First check cache
        cached = self.get_device_by_ip(ip)

        # Do a fresh scan
        device_info = self.get_device_info(ip)

        # Enrich with cached data if available
        if cached and not device_info["reachable"]:
            device_info = cached
            device_info["from_cache"] = True

        # Extended port scan for details
        if device_info["reachable"]:
            extended_ports = self.common_ports + [1433, 1521, 3306, 5432, 6379, 8443, 27017]
            device_info["detailed_ports"] = self.scan_ports(ip, ports=extended_ports, timeout=0.5)

        return device_info

    def start_background_scan(self, ip_range_start, ip_range_end):
        """
        Start a background scanner thread.

        Args:
            ip_range_start: Start of IP range
            ip_range_end: End of IP range
        """
        if self._running:
            logger.warning("Background scan already running")
            return

        self._running = True

        def _scan_loop():
            while self._running:
                try:
                    logger.info("Starting background network scan: %s - %s", ip_range_start, ip_range_end)
                    self.scan_range(ip_range_start, ip_range_end)
                except Exception as e:
                    logger.error("Background scan error: %s", e)
                time.sleep(self.scan_interval)

        self._scan_thread = threading.Thread(target=_scan_loop, daemon=True, name="bg-scanner")
        self._scan_thread.start()
        logger.info("Background scanner started")

    def stop_background_scan(self):
        """Stop the background scanner thread."""
        self._running = False
        logger.info("Background scanner stopped")
