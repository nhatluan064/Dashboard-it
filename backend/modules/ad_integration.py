"""
Active Directory integration module for IT Dashboard.
Provides read-only queries to AD using ldap3 for computer, user, and group lookups.
All operations use read-only access - no AD admin privileges required.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Try to import ldap3, provide graceful fallback
try:
    from ldap3 import Server, Connection, ALL, SUBTREE, BASE
    HAS_LDAP3 = True
except ImportError:
    HAS_LDAP3 = False
    logger.warning("ldap3 library not installed. AD integration will be unavailable. "
                   "Install with: pip install ldap3")


class ADIntegration:
    """Active Directory integration for querying computers, users, and groups."""

    def __init__(self, app=None):
        self.app = app
        self.server = None
        self.connection = None
        self.base_dn = ""
        self.connected = False

        if app:
            self.init_app(app)

    def init_app(self, app):
        """Initialize with Flask app configuration."""
        self.app = app
        self.ad_server = app.config.get("AD_SERVER", "")
        self.ad_port = app.config.get("AD_PORT", 636)
        self.ad_use_ssl = app.config.get("AD_USE_SSL", True)
        self.ad_base_dn = app.config.get("AD_BASE_DN", "")
        self.ad_bind_dn = app.config.get("AD_BIND_DN", "")
        self.ad_bind_password = app.config.get("AD_BIND_PASSWORD", "")
        self.ad_search_ou = app.config.get("AD_SEARCH_OU", "")
        self.ad_timeout = app.config.get("AD_TIMEOUT", 30)
        self.base_dn = self.ad_base_dn

    def _connect(self):
        """
        Establish connection to Active Directory.

        Returns:
            True if connected, False otherwise
        """
        if not HAS_LDAP3:
            logger.error("ldap3 library not installed")
            return False

        if not self.ad_server:
            logger.error("AD server not configured")
            return False

        try:
            if self.connected and self.connection and self.connection.bound:
                return True

            self.server = Server(
                self.ad_server,
                port=self.ad_port,
                use_ssl=self.ad_use_ssl,
                get_info=ALL,
                connect_timeout=self.ad_timeout,
            )

            self.connection = Connection(
                self.server,
                user=self.ad_bind_dn,
                password=self.ad_bind_password,
                auto_bind=True,
                raise_exceptions=False,
            )

            if self.connection.bound:
                self.connected = True
                logger.info("Connected to AD server: %s", self.ad_server)
                return True
            else:
                logger.error("Failed to bind to AD server")
                return False

        except Exception as e:
            logger.error("AD connection error: %s", e)
            self.connected = False
            return False

    def _disconnect(self):
        """Close the AD connection."""
        try:
            if self.connection:
                self.connection.unbind()
        except Exception as e:
            logger.debug("Error disconnecting from AD: %s", e)
        finally:
            self.connected = False
            self.connection = None

    def _search(self, search_filter, attributes, search_base=None, search_scope=SUBTREE):
        """
        Execute an AD search query.

        Args:
            search_filter: LDAP search filter
            attributes: List of attributes to retrieve
            search_base: Optional override for search base
            search_scope: LDAP search scope

        Returns:
            list of matching entries or empty list on failure
        """
        if not self._connect():
            return []

        base = search_base or self.ad_search_ou or self.base_dn
        if not base:
            logger.error("No search base configured for AD")
            return []

        try:
            results = self.connection.search(
                search_base=base,
                search_filter=search_filter,
                search_scope=search_scope,
                attributes=attributes,
                size_limit=500,
                time_limit=self.ad_timeout,
            )

            if results:
                entries = []
                for entry in self.connection.entries:
                    entry_dict = {}
                    for attr in attributes:
                        value = entry[attr].values if hasattr(entry[attr], 'values') else [entry[attr].value] if entry[attr].value else []
                        if isinstance(value, list) and len(value) == 1:
                            value = value[0]
                        entry_dict[attr] = value
                    entries.append(entry_dict)
                return entries

            return []

        except Exception as e:
            logger.error("AD search error: %s", e)
            return []

    def get_ad_computers(self, ou=None):
        """
        List computers from Active Directory.

        Args:
            ou: Optional OU to search within

        Returns:
            list of computer entries with name, OS, whenCreated, memberOf
        """
        attributes = [
            "cn",
            "dNSHostName",
            "operatingSystem",
            "operatingSystemVersion",
            "whenCreated",
            "memberOf",
            "lastLogonTimestamp",
            "distinguishedName",
            "objectGUID",
            "description",
            "location",
        ]

        search_filter = "(objectClass=computer)"

        search_base = ou or self.ad_search_ou or self.base_dn

        entries = self._search(search_filter, attributes, search_base=search_base)

        computers = []
        for entry in entries:
            computer = {
                "name": entry.get("cn", ""),
                "hostname": entry.get("dNSHostName", ""),
                "os": entry.get("operatingSystem", "Unknown"),
                "os_version": entry.get("operatingSystemVersion", ""),
                "when_created": self._format_ad_time(entry.get("whenCreated", "")),
                "description": entry.get("description", ""),
                "location": entry.get("location", ""),
                "last_logon": self._format_ad_timestamp(entry.get("lastLogonTimestamp", "")),
                "distinguished_name": entry.get("distinguishedName", ""),
                "groups": self._extract_group_names(entry.get("memberOf", [])),
            }
            computers.append(computer)

        logger.info("Found %d computers in AD", len(computers))
        return computers

    def get_ad_users(self, ou=None):
        """
        List users from Active Directory.

        Args:
            ou: Optional OU to search within

        Returns:
            list of user entries
        """
        attributes = [
            "sAMAccountName",
            "displayName",
            "employeeID",
            "mail",
            "memberOf",
            "lastLogonTimestamp",
            "distinguishedName",
            "title",
            "department",
            "telephoneNumber",
            "whenCreated",
            "accountDisabled",
        ]

        search_filter = "(&(objectClass=user)(objectCategory=person))"
        search_base = ou or self.ad_search_ou or self.base_dn

        entries = self._search(search_filter, attributes, search_base=search_base)

        users = []
        for entry in entries:
            user = {
                "username": entry.get("sAMAccountName", ""),
                "display_name": entry.get("displayName", ""),
                "employee_id": entry.get("employeeID", ""),
                "email": entry.get("mail", ""),
                "title": entry.get("title", ""),
                "department": entry.get("department", ""),
                "phone": entry.get("telephoneNumber", ""),
                "last_logon": self._format_ad_timestamp(entry.get("lastLogonTimestamp", "")),
                "when_created": self._format_ad_time(entry.get("whenCreated", "")),
                "disabled": entry.get("accountDisabled", False),
                "distinguished_name": entry.get("distinguishedName", ""),
                "groups": self._extract_group_names(entry.get("memberOf", [])),
            }
            users.append(user)

        logger.info("Found %d users in AD", len(users))
        return users

    def get_ad_groups(self):
        """
        List all groups from Active Directory.

        Returns:
            list of group entries
        """
        attributes = [
            "cn",
            "displayName",
            "description",
            "distinguishedName",
            "member",
            "groupType",
            "whenCreated",
        ]

        search_filter = "(objectClass=group)"
        entries = self._search(search_filter, attributes)

        groups = []
        for entry in entries:
            group = {
                "name": entry.get("cn", ""),
                "display_name": entry.get("displayName", ""),
                "description": entry.get("description", ""),
                "distinguished_name": entry.get("distinguishedName", ""),
                "members": self._extract_member_names(entry.get("member", [])),
                "group_type": self._decode_group_type(entry.get("groupType", 0)),
                "when_created": self._format_ad_time(entry.get("whenCreated", "")),
            }
            groups.append(group)

        logger.info("Found %d groups in AD", len(groups))
        return groups

    def search_ad(self, query):
        """
        Search AD by employee ID or name.

        Args:
            query: Search string (employee ID or name)

        Returns:
            dict with computers and users matching the query
        """
        if not query or len(query) < 2:
            return {"success": False, "message": "Query too short", "computers": [], "users": []}

        # Escape special LDAP characters
        safe_query = query.replace("\\", "\\5c").replace("*", "\\2a").replace("(", "\\28").replace(")", "\\29")

        # Search users by name or employee ID
        user_filter = f"(&(objectClass=user)(objectCategory=person)(|(sAMAccountName=*{safe_query}*)(displayName=*{safe_query}*)(employeeID={safe_query})))"

        user_attributes = [
            "sAMAccountName", "displayName", "employeeID", "mail",
            "title", "department", "distinguishedName", "memberOf",
        ]

        users = self._search(user_filter, user_attributes)
        formatted_users = []
        for entry in users:
            formatted_users.append({
                "username": entry.get("sAMAccountName", ""),
                "display_name": entry.get("displayName", ""),
                "employee_id": entry.get("employeeID", ""),
                "email": entry.get("mail", ""),
                "title": entry.get("title", ""),
                "department": entry.get("department", ""),
                "groups": self._extract_group_names(entry.get("memberOf", [])),
            })

        # Search computers
        computer_filter = f"(&(objectClass=computer)(|(cn=*{safe_query}*)(dNSHostName=*{safe_query}*)))"

        computer_attributes = [
            "cn", "dNSHostName", "operatingSystem", "description",
            "distinguishedName", "memberOf",
        ]

        computers = self._search(computer_filter, computer_attributes)
        formatted_computers = []
        for entry in computers:
            formatted_computers.append({
                "name": entry.get("cn", ""),
                "hostname": entry.get("dNSHostName", ""),
                "os": entry.get("operatingSystem", "Unknown"),
                "description": entry.get("description", ""),
                "groups": self._extract_group_names(entry.get("memberOf", [])),
            })

        result = {
            "success": True,
            "query": query,
            "users": formatted_users,
            "computers": formatted_computers,
            "total_results": len(formatted_users) + len(formatted_computers),
        }

        logger.info("AD search for '%s': %d users, %d computers",
                     query, len(formatted_users), len(formatted_computers))
        return result

    def get_computer_detail(self, hostname):
        """
        Get detailed information about a specific computer.

        Args:
            hostname: Computer hostname or name

        Returns:
            dict with full computer detail
        """
        safe_name = hostname.replace("\\", "\\5c").replace("*", "\\2a")
        search_filter = f"(&(objectClass=computer)(|(cn={safe_name})(dNSHostName={safe_name}*)))"

        attributes = [
            "cn", "dNSHostName", "operatingSystem", "operatingSystemVersion",
            "whenCreated", "distinguishedName", "description", "location",
            "memberOf", "lastLogonTimestamp", "objectGUID",
            "managedBy", "servicePrincipalName",
        ]

        entries = self._search(search_filter, attributes)

        if not entries:
            return {"success": False, "message": f"Computer '{hostname}' not found"}

        entry = entries[0]

        computer = {
            "success": True,
            "name": entry.get("cn", ""),
            "hostname": entry.get("dNSHostName", ""),
            "os": entry.get("operatingSystem", "Unknown"),
            "os_version": entry.get("operatingSystemVersion", ""),
            "when_created": self._format_ad_time(entry.get("whenCreated", "")),
            "distinguished_name": entry.get("distinguishedName", ""),
            "description": entry.get("description", ""),
            "location": entry.get("location", ""),
            "managed_by": entry.get("managedBy", ""),
            "last_logon": self._format_ad_timestamp(entry.get("lastLogonTimestamp", "")),
            "groups": self._extract_group_names(entry.get("memberOf", [])),
            "service_principals": entry.get("servicePrincipalName", []),
        }

        return computer

    def get_user_groups(self, username):
        """
        Get group memberships for a specific user.

        Args:
            username: sAMAccountName

        Returns:
            list of group names
        """
        safe_username = username.replace("\\", "\\5c").replace("*", "\\2a")
        search_filter = f"(&(objectClass=user)(sAMAccountName={safe_username}))"
        attributes = ["memberOf", "sAMAccountName"]

        entries = self._search(search_filter, attributes)

        if not entries:
            return []

        return self._extract_group_names(entries[0].get("memberOf", []))

    def _format_ad_time(self, ad_time):
        """Format AD time string for display."""
        if not ad_time:
            return ""
        try:
            if isinstance(ad_time, datetime):
                return ad_time.isoformat()
            return str(ad_time)
        except Exception:
            return str(ad_time)

    def _format_ad_timestamp(self, timestamp):
        """Convert Windows FILETIME timestamp to readable date."""
        if not timestamp:
            return ""
        try:
            if isinstance(timestamp, datetime):
                return timestamp.isoformat()
            # FILETIME: 100-nanosecond intervals since Jan 1, 1601
            ts = int(timestamp)
            if ts <= 0:
                return ""
            # Convert to Unix timestamp
            unix_ts = (ts - 116444736000000000) / 10000000
            dt = datetime.fromtimestamp(unix_ts, tz=timezone.utc)
            return dt.isoformat()
        except (ValueError, TypeError, OSError):
            return str(timestamp)

    def _extract_group_names(self, member_of):
        """Extract readable group names from DN list."""
        if not member_of:
            return []
        if isinstance(member_of, str):
            member_of = [member_of]

        groups = []
        for dn in member_of:
            if isinstance(dn, str) and dn.startswith("CN="):
                # Extract CN value from distinguished name
                cn = dn.split(",")[0].replace("CN=", "").strip()
                groups.append(cn)
        return groups

    def _extract_member_names(self, members):
        """Extract readable member names from DN list."""
        if not members:
            return []
        if isinstance(members, str):
            members = [members]

        names = []
        for dn in members:
            if isinstance(dn, str) and dn.startswith("CN="):
                cn = dn.split(",")[0].replace("CN=", "").strip()
                names.append(cn)
        return names

    def _decode_group_type(self, group_type):
        """Decode AD group type value."""
        try:
            gt = int(group_type)
            types = {
                2: "Global Distribution",
                4: "Domain Local Distribution",
                8: "Universal Distribution",
                -2147483646: "Global Security",
                -2147483644: "Domain Local Security",
                -2147483640: "Universal Security",
            }
            return types.get(gt, f"Type {gt}")
        except (ValueError, TypeError):
            return "Unknown"
