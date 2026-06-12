const _hostname = window.location.hostname;
export const hostname = {
	"www.52shuku123.cc": "www.dameishuwang.net",
    "www.52shuwu.net": "www.52shuku.vip",
    "www.52shuwu.top": "www.52shuku.vip",
    "www.52shuku.net": "www.52shuku.vip",
    "www.banxia.la": "www.xbanxia.com",
    "www.xbanxia.cc": "www.xbanxia.com",
}[_hostname] ?? _hostname;
