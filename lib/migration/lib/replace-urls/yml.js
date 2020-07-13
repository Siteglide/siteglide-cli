const fs = require('fs');

module.exports = (filePath,i) => {
	var name = '';
	var isHomepage = '';
	var filePathSplit = filePath.split('/');
	if(filePathSplit[filePathSplit.length-1].indexOf('index.')===0){
		name = filePathSplit[filePathSplit.length-2];
	}else{
		name = filePathSplit[filePathSplit.length-1];
	}

	if(i===0){
		name = 'Homepage';
		isHomepage = '\n  is_homepage: true';
	}
	var YML =
`---
metadata:
  name: "${name}"
  enabled: true
  file_type: page
  last_edit: ${Math.round(new Date().getTime())}${isHomepage}
redirect_to: ''
redirect_url: ''
---
`;
	var data = fs.readFileSync(filePath).toString();
	if(data[0]!=='---'){
		data = YML+data;
	}
	return data;
};
