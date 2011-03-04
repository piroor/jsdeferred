/*include JSDeferred*/

function shutdown()
{
	destroy();
	Deferred = undefined;
}

exports = {};
Deferred.define(exports);
