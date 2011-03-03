/*include JSDeferred*/

function shutdown()
{
	timers.forEach(function(aTimer) {
		aTimer.cancel();
	});
	timers = undefined;
	Deferred = undefined;
}

exports = {};
Deferred.define(exports);
