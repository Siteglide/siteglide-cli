const waitForStatus = (statusCheck) => {
	return new Promise((resolve, reject) => {
		var count = 0;
		(getStatus = () => {
			statusCheck().then(response => {
				if (response.status === 'pending' || response.status === 'ready_for_export') {
					if(count<80){
						setTimeout(getStatus, 1500);
						count++;
					}else{
						count = 0;
						reject('error');
					}
				} else if (response.status === 'done' || response.status === 'success' || response.status === 'error') {
					count = 0;
					resolve(response);
				} else {
					count = 0;
					reject('error');
				}
			});
		})();
	});
};


module.exports = waitForStatus;