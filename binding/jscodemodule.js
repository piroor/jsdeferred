var EXPORTED_SYMBOLS = ["Deferred"];

function setTimeout (f, i) {
	let timer = Components.classes["@mozilla.org/timer;1"]
					.createInstance(Components.interfaces.nsITimer);
	timer.initWithCallback(f, i, timer.TYPE_ONE_SHOT);
	return timer;
}

function clearTimeout (timer) {
	timer.cancel();
}

/*include JSDeferred*/
