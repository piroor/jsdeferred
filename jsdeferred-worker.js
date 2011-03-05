importScripts('jsdeferred.js');

onmessage = function (event) {
	var message = event.data;
	var _global = this;
	switch (message.type) {
		case 'request':
			var data = { id : message.json.id }
			Deferred
				.next(function () {
					return eval(message.json.code);
				})
				.next(function (value) {
					data.value = value;
					postMessage(data);
				})
				.error(function (error) {
					data.error = error;
					postMessage(data);
				});
			break;

		case 'destroy':
			_global.onmessage = undefined;
			break;
	}
};

postMessage({ id : -1, init : true });
