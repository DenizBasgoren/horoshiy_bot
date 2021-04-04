
// IMPORTANT: For the role management to work, role of the bot should be on higher rank than users
// IMPORTANT: Check all the ids before running the code on the server!

const fs = require('fs')
const path = require('path')
const process = require('process')
const Discord = require('discord.js')
const client = new Discord.Client()

const l = console.log


/* // Test server constants
const GUILD_ID = '822879430518112298'
const WORDGAME_ID = '827958601712533524'
const BOT_SF = '822876188363325440' // doesn't change on joins
const DB_FILENAME = 'nouns_db.txt'
let LAST_USED_WORD
let LAST_USED_WORD_AUTHOR_ID // this is user.id, not member.id!

let wordgame_channel

// IMPORTANT: For the role management to work, role of the bot should be on higher rank than users
const ROLES = [
	{ name: 'Kazakh', value: '823293600153862164' },
	{ name: 'Viking', value: '823293786637336607' },
	{ name: 'Marsian', value: '823293870016167966' },
	{ name: 'Elf', value: '823352838238502937' },
	{ name: 'None', value: '' },
]

const MOD_ROLE_ID = '827921029749932033'
*/


// REAL ONES
const GUILD_ID = '332536665338019841'
const WORDGAME_ID = '815028344084103188'
const BOT_SF = '822876188363325440' // doesn't change on joins
const DB_FILENAME = 'nouns_db.txt'
let LAST_USED_WORD
let LAST_USED_WORD_AUTHOR_ID // this is user.id, not member.id!

let wordgame_channel


const ROLES = [
	{ name: 'Native', value: '367774473325248512' },
	{ name: 'Proficient', value: '367772752918216717' },
	{ name: 'Advanced', value: '367772716142559242' },
	{ name: 'Upper-Intermediate', value: '367772612157243402' },
	{ name: 'Intermediate', value: '367772664397561866' },
	{ name: 'Elementary', value: '367772564216610816' },
	{ name: 'Basic', value: '367761890144813067' },
	{ name: 'Beginner', value: '367759647697797120' },
	{ name: 'None', value: '' }
]

const MOD_ROLE_ID = '433994039335845898'



const DB = fs.readFileSync(`${__dirname}/${DB_FILENAME}`, {encoding: 'utf8'} )
.split('\n').reduce((acc,cur) => {acc[cur] = true; return acc;}, {})
let USED_WORDS = {}
let USED_WORDS_COUNT = 0
let MAX_WORDS_ON_FIRST_FETCH = 1000


// returns empty string on error case, which ideally should be unreachable
function extract_last_letter(word) {
	for( let i = word.length-1; i>=0; i--) {
		if ( !/[ьъый]/.test( word[i] ) ) return word[i]
	}
	return ''
}

// fn might return null, so always check for null case
function extract_word ( sentence ) {

	// trim the end. get the last line (assuming it's the one with the word)
	// first non-matching group: any of space, _, *, ~, `, |, >
	// matching group (main): cyrillic letters including ё, stress marker (0x0301), _, *, ~, `, |
	// ... or of the form (word)-(word) (eg. нефть-сырец)
	// last non-matching group: anything except cyrillic letters and the stress marker. Go until the end
	
	return sentence.trimEnd().split('\n').pop().match(
		/^(?:[\x20_*~`|>]*)([\u0410-\u044f\u0401\u0451\u0301_*~`|]{2,40}|[\u0410-\u044f\u0401\u0451\u0301_*~`|]{1,40}-[\u0410-\u044f\u0401\u0451\u0301_*~`|]{1,40})(?:[^\u0410-\u044f\u0401\u0451\u0301]{3,})$/
	)?.[1].split('').filter(l => {
		let charcode = l.charCodeAt()
		return (charcode >= 0x0410 && charcode <= 0x044f || charcode == 0x0401 || charcode == 0x0451 || l == '-')
	}).join('').toLowerCase()
}

// fn assumes that both word and author_id exist (are not null)
function apply_wordgame_tests(word, author_id) {
	let result = [
		!!DB[word],
		!USED_WORDS[word],
		extract_last_letter(LAST_USED_WORD) === word[0],
		author_id !== LAST_USED_WORD_AUTHOR_ID
	]

	result.explanation = `:mag: Examined word: **${word}**\n` +
	`${result[0] ? ':white_check_mark:' : ':x:'} The word is in the dictionaries OpenRussian, KartaSlov.\n` +
	`${result[1] ? ':white_check_mark:' : ':x:'} The word was not used recently.\n` +
	`${result[2] ? ':white_check_mark:' : ':x:'} The word starts with the letter '${extract_last_letter(LAST_USED_WORD)}'.\n` +
	`${result[3] ? ':white_check_mark:' : ':x:'} The author can't submit two sentences in a row.\n`

	return result
}



// This fires only once, when the bot has logged in
client.on('ready', async () => {
	l(`Logged in as ${client.user.tag}!`)

	await client.api.applications(client.user.id).guilds(GUILD_ID).commands.post({
		data: {
			name: 'word',
			description: 'Check if you picked a good word for #word_game.',
			options: [
				{
					name: 'word',
					description: 'Write your word in Russian',
					required: true,
					type: 3
					// 3 = string
					// https://discord.com/developers/docs/interactions/slash-commands#applicationcommandoptiontype
				}
			]
		}
	})

	await client.api.applications(client.user.id).guilds(GUILD_ID).commands.post({
		data: {
			name: 'role',
			description: 'Set your role in the Russian language.',
			options: [
				{
					name: 'role',
					description: 'Your role (beginner, advanced, native etc.)',
					required: true,
					type: 3,
					// 8 = role, 3 = string
					// https://discord.com/developers/docs/interactions/slash-commands#applicationcommandoptiontype
					choices: ROLES
				}
			]
		}
	})

	
	wordgame_channel = await client.channels.fetch(WORDGAME_ID, true)
	let oldest_message_id = '9223372036854775807' // max snowflake, year 2084
	global.words_added_on_first_fetch = 0 // we check only last 1000 words (MAX_WORDS_ON_FIRST_FETCH)
	// we use global here, so that the variable doesn't get garbage collected from the memory, after
	// we leave the scope (since we need to access the variable in a setTimeout, which works after GC)

	setTimeout(fetch_100_messages, 50) // 50 ms delay, so that discord doesn't think it's an API abuse

	async function fetch_100_messages() {
		let messages = await wordgame_channel.messages.fetch({limit: 100, before: oldest_message_id})
		messages = messages.array()
		oldest_message_id = messages[messages.length-1].id // last msg id

		messages.filter(m => !m.deleted && !m.application && !m.author.bot).forEach(m => {

			let word = extract_word(m.content)

			// l(`${m.id} - ${m.author.username} - ${word}`)
			if (word) {
				USED_WORDS[word] = true
				global.words_added_on_first_fetch++

				// here we check so that it gets assigned only once, on the first iteration.
				// message history lookup starts from the last message anyway.
				if (!LAST_USED_WORD) {
					LAST_USED_WORD = word
					LAST_USED_WORD_AUTHOR_ID = m.author.id // user_id
				}
			}
		})

		if (messages.length === 100 && global.words_added_on_first_fetch < MAX_WORDS_ON_FIRST_FETCH) {
			setTimeout(fetch_100_messages, 50)
		}
		else {
			// log something if we need to know the words fetched, or the count ..
			// this will execute once, on the last iteration
			// l(`we got ${global.words_added_on_first_fetch} words`)
		}
	}




	client.ws.on('INTERACTION_CREATE', async interaction => {

		// interaction.data object:
		// {
		// 	options: [ { value: 'korsan', type: 3, name: 'word' } ],
		// 	name: 'word',
		// 	id: '823254640492806174'
		//   }

		// interaction object:
		// {version: 1,
		// 	type: 2,
		// 	token: 'aW50ZXJhY3Rpb246ODIzMjY3NTI5MzE2MzY4Mzg0OnYzU2RnVndLZ1ZDQXd5UmM5ZWJCUzkyd0cwNElLalc4T2kzQ3JmV2dhUW9CZ0JvNDN2bXpOT0JMSHpRbm9CTlJnUVNxQ0U1UFlnQW1EbVZNNHRRVFZRNnNoMk1tNnc0ejhESmx1elV5YVlhTEVLZ3lvSzZVU1oySU1DbHJlMVJv',
		// 	member: {
		// 	  user: {
		// 		username: 'Korsan',
		// 		public_flags: 0,
		// 		id: '208015839847251968',
		// 		discriminator: '9205',
		// 		avatar: '744bae8e939ec27623190a9a40267ef1'
		// 	  },
		// 	  roles: [],
		// 	  premium_since: null,
		// 	  permissions: '8589934591',
		// 	  pending: false,
		// 	  nick: null,
		// 	  mute: false,
		// 	  joined_at: '2021-03-20T17:09:04.691000+00:00',
		// 	  is_pending: false,
		// 	  deaf: false
		// 	},
		// 	id: '823267529316368384',
		// 	guild_id: '822879430518112298',
		// 	data: { options: [ [Object] ], name: 'word', id: '823254640492806174' },
		// 	channel_id: '822879431022215259',
		// 	application_id: '822876188363325440'
		//   }

		if (interaction.guild_id !== GUILD_ID ) return

		if (interaction.data.name == 'word' ) {

			// if (interaction.channel_id !== WORDGAME_ID ) return // TODO: change to a warning

			// let channel = await client.channels.fetch(interaction.channel_id, true)
			// channel.send(`Got a request from ${interaction.member.nick || interaction.member.user.username}!` +
			// ` Looked up word: ${interaction.data.options[0].value}`)

			// response types: 4=immediate(3seconds), 5=deferred(15minutes)
			// https://discord.com/developers/docs/interactions/slash-commands#interaction-response-interactionresponsetype

			// let leResponse = `Got a request from ${interaction.member.nick || interaction.member.user.username}!` +
			// ` Looked up word: ${interaction.data.options[0].value}`

			let word = interaction.data.options[0].value.trim().toLowerCase()
			let test_results = apply_wordgame_tests(word, interaction.member.user.id)

			let leResponse = test_results.explanation

			l(`Word ${word} tests: ${test_results}`)
			
			client.api.interactions(interaction.id, interaction.token).callback.post({
				data: {
					type: 4,
					data: {
						content: leResponse,
						flags: 64 // 64=onlyUserSees
					}
				}
			})

		}

		else if ( interaction.data.name == 'role' ) {

			let leResponse = `Setting role of ${interaction.member.nick || interaction.member.user.username}` +
			` to ${ ROLES.filter(r => r.value === interaction.data.options[0].value)[0].name }!`

			// l(interaction.data)
			

			let guild = await client.guilds.fetch(GUILD_ID, true)
			let member = await guild.members.fetch(interaction.member.user.id)

			// l(member.roles)
			// l(ROLES.map(r => r.value).filter(sf => sf))
			
			await member.roles.remove( ROLES.map(r => r.value).filter(sf => sf) )

			if (interaction.data.options[0].value) {
				await member.roles.add(interaction.data.options[0].value)
			}

			client.api.interactions(interaction.id, interaction.token).callback.post({
				data: {
					type: 4,
					data: {
						content: leResponse,
						flags: 64 // 64=onlyUserSees
					}
				}
			})
		}

		
	})
})

// this runs every time someone posts a message on any of the channels in the server
client.on('message', msg => {

	// l(msg)
	// l(`msg: ${msg.content}`)

	// msg.application.name === BOT_NAME
	
	// we check against the id, as the id doesn't change, but the name does
	if (msg.system && msg.application?.id === BOT_SF) {
		msg.delete()
		return
	}


	// do checks only on user messages
	if (msg.author.id !== BOT_SF) {
		

		if (msg.channel.id === WORDGAME_ID) {
			let word = extract_word(msg.content)

			if (!word) {

				// if it's a mod who posted a faulty message, don't warn them and ignore
				if (msg.member?.roles.cache.get(MOD_ROLE_ID)) {
					return
				}

				// copy msg
				let faulty_entry = msg.content
				// remove msg
				msg.delete({reason: 'Doesn\'t comply with the rules of #word_game'})
				// dm the msg to the user, and warn
				msg.author.createDM().then(dm => {
					dm.send(
						`Warning: The message you posted on #word_game doesn't comply with the rules of the game,`+
						` so it was removed. I saved the message for you so that you don't have to write it again:`+
						`\n\n${faulty_entry}`
					)
				})

				return
			}

			let test_results = apply_wordgame_tests(word, msg.author.id)

			// l(`Submitted word ${word} tests: ${test_results}`)

			// if all 4 tests are true
			if (test_results.reduce((a,c) => a&&c, true)) {
				// update last_word
				// update last_author
				LAST_USED_WORD = word
				LAST_USED_WORD_AUTHOR_ID = msg.author.id
				// add the word to the used words list
				USED_WORDS[word] = true
				// l(`added word ${word}`)
				return
			}
			
			// if it's a mod who posted a faulty message, don't warn them and ignore
			if (msg.member?.roles.cache.get(MOD_ROLE_ID)) {
				return
			}

			// copy msg
			let faulty_entry = msg.content
			// remove msg
			msg.delete({reason: 'Doesn\'t comply with the rules of #word_game'})
			// dm the msg to the user, and warn
			msg.author.createDM().then(dm => {
				dm.send(
					`Warning: The message you posted on #word_game doesn't comply with the rules of the game,`+
					` so it was removed. Here are the test results:\n\n`+
					`${test_results.explanation}\n`+
					`I saved the message for you so that you don't have to write it again:`+
					`\n\n${faulty_entry}\n\n`+
					`Remember that you can always examine a word via the \`/word\` command on the server. `+
					`There are other commands as well. Be sure to check them all out!`
				)
			})
			
			
		
			return
		}
	

	}
})

client.login(process.env.PASSWORD)

// GENERATED AT WEB DEVPORTAL / OAUTH2
// https://discord.com/api/oauth2/authorize?client_id=822876188363325440&permissions=268511232&scope=bot%20applications.commands

// make sure that oauth2 is off!
// perms: - send msg, manage msg, read msg hist, manage roles

// notes:
// openrussian nouns.csv: \t -> ,