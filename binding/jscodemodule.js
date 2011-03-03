var EXPORTED_SYMBOLS = ["Deferred"];

function D () {

var timers = [];

function setTimeout (f, i) {
	let timer = Components.classes["@mozilla.org/timer;1"]
					.createInstance(Components.interfaces.nsITimer);
	timer.initWithCallback(f, i, timer.TYPE_ONE_SHOT);
	timers.push(timer);
	return timer;
}

function clearTimeout (timer) {
	timers.splice(timers.indexOf(timer), 1);
	timer.cancel();
}

/*include JSDeferred*/

Deferred.postie_for_message_manager = function (manager) {
	var ret = {
			__proto__ : manager,
			__noSuchMethod__ : function (name, args) {
				return manager[name].apply(manager, args);
			}
		};
	var id  = 0;
	var cb  = {};
	var mm  = [];

	var postieId = Date.now() + ':' + parseInt(Math.random() * 65000);

	var messageListener = function (message) {
			message = message.json;
			if (message.init) {
				for (let i = 0, it; it = mm[i]; i++) {
					manager.sendAsyncMessage(postieId+':request', it);
				}
				mm = null;
			} else  {
				let c = cb[message.id];
				if (c) c(message.value, message.error);
			}
		};
	manager.addMessageListener(postieId+':response', messageListener);

	manager.loadFrameScript('data:application/javascript,'+encodeURIComponent(<![CDATA[
		(function(_global) {
			var [Deferred, timers] = %JSDEFERRED%();
			var _onMessage = function (message) {
					switch (message.name) {
						case '%ID%:request':
							var data = { id : message.json.id }
							Deferred
								.next(function () {
									return eval(message.json.code);
								})
								.next(function (value) {
									data.value = value;
									sendAsyncMessage('%ID%:response', data);
								})
								.error(function (error) {
									data.error = error;
									sendAsyncMessage('%ID%:response', data);
								});
							break;

						case '%ID%:destroy':
							removeMessageListener('%ID%:request', onMessage);
							removeMessageListener('%ID%:destroy', onMessage);
							timers.forEach(function(aTimer) {
								aTimer.cancel();
							});
							timers = undefined;
							_onMessage = undefined;
							_global = undefined;
							Deferred = undefined;
							break;
					}
				};
			addMessageListener('%ID%:request', _onMessage);
			addMessageListener('%ID%:destroy', _onMessage);
			sendAsyncMessage('%ID%:response', { id : -1, init : true });
		})(this);
	]]>.toString()
		.replace(/%ID%/g, postieId)
		.replace(/%JSDEFERRED%/, D.toSource())
	), false);

	ret.post = function (args, code) {
		var deferred = new Deferred();
		args = Array.prototype.slice.call(arguments, 0);
		code = args.pop();

		code = (typeof code == 'function') ? code.toSource() : 'function () {' + code + '}';

		var mes = {
			id : id++,
			code : '(' + code + ').apply(_global, ' + JSON.stringify(args) + ')'
		};

		cb[mes.id] = function (v, e) { e ? deferred.fail(e) : deferred.call(v) };

		if (mm) {
			mm.push(mes);
		} else {
			manager.sendAsyncMessage(postieId+':request', mes);
		}

		return deferred;
	};

	ret.destroy = function () {
		manager.sendAsyncMessage(postieId+':destroy');
		manager.removeMessageListener(postieId+':response', messageListener);
	};

	return ret;
};

Deferred.postie = function (target) {
	if (target instanceof Components.interfaces.nsIFrameMessageManager)
		return Deferred.postie_for_message_manager(target);
	else
		throw new Error('unknown type object was given to Deferred.postie().\n'+target);
};

Deferred.Deferred = Deferred;
return [Deferred, timers];
}

var [Deferred, timers] = D();
