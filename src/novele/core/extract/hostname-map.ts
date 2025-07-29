const _hostname = window.location.hostname;
export const hostname = {
	"www.52shuku123.cc": "www.dameishuwang.net",
    "www.52shuwu.net": "www.52shuku.vip",
    "www.52shuku.net": "www.52shuku.vip",
    "www.banxia.la": "www.xbanxia.com",
    "www.256wx.org": "www.256wx.net",
    "www.52shukuw.com": "www.52shukuw.cc"
}[_hostname] ?? _hostname;