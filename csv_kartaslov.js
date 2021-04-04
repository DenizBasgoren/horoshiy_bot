let fs = require('fs')
let l = console.log

let a1 = fs.readFileSync('./nouns_kartaslov.csv', {encoding: 'utf8'})
// dataset taken from: https://github.com/dkulagin/kartaslov/tree/master/dataset/open_semantics/simple/semantics_simple.csv
// license (creative commons): https://github.com/dkulagin/kartaslov/blob/master/readme/commercial_use.md
// taken on 23 March 2021

a1 = a1.split('\n').map(l => l.split(';'))
.filter((l,i) => i !== 0
&& l[0].length > 1
)
.map(l => l[0]).sort()

l(`Kartaslov length: ${a1.length}`) // should be 32388

// fs.writeFileSync('./nouns_kartaslov.txt', a1.join('\n') )
l('done ^.^')





let a2 = fs.readFileSync('./nouns_openrussian.csv', {encoding: 'utf8'})
// taken from https://github.com/Badestrand/russian-dictionary/blob/master/words.csv
// license (creative commons): https://github.com/Badestrand/russian-dictionary/blob/master/LICENSE 
// taken on 23 march 2021

a2 = a2.split('\n').map(l => l.split('\t'))
.filter(l => l[11] === 'noun' && l[6] === '0'
&& !(l[2][0].charCodeAt() >= 0x410 && l[2][0].charCodeAt() <= 0x042f)
// note: no word starts with capital Ё on OpenRussian, so we omit that
&& !/[^-\u0410-\u044f\u0401\u0451\u0301]/.test(l[2])
)
.map(l => l[2]).sort()

l(`Openrussian length: ${a2.length}`) // should be 26742

// fs.writeFileSync('./nouns_openrussian.txt', a2.join('\n') )
l('done ^.^')







function mergeArrays(a1, a2) {
	let res = []

	let i1 = 0
	let i2 = 0

	let last = () => res[res.length-1]

	while(i1 < a1.length && i2 < a2.length) {
		if (a1[i1] < a2[i2]) {
			if (last() !== a1[i1] ) res.push( a1[i1] )
			i1++
		}
		else {
			if (last() !== a2[i2] )  res.push( a2[i2] )
			i2++
		}
	}

	while( i1 < a1.length ) {
		if (last() !== a1[i1] )  res.push( a1[i1] )
		i1++
	}

	while( i2 < a2.length ) {
		if (last() !== a2[i2] )  res.push( a2[i2] )
		i2++
	}

	return res
}


let a3 = mergeArrays(a1,a2)
l(`Total word count: ${a3.length}`) // 37767

fs.writeFileSync('./nouns_db.txt', a3.join('\n') )
l('done ^.^')