module.exports = ($) => {
	const forms = $('form[action], form[onsubmit]');
	forms.each((i,el) => {
		if(
			(el.attribs)&&
			(el.attribs.name)&&
			(!el.attribs.name.includes('catsearchform'))
		){
			el.attribs.action = '/__form';
			el.attribs.onsubmit = '';
		};
	});
};
