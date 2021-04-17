import './index.css';
import React from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import App from './App';

import {Dex} from '@pkmn/dex';
import {Generations} from '@pkmn/data';

ReactDOM.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
	document.getElementById('root')
);

(async() => {
	const {data} = await axios.get('https://pokeapi.co/api/v2/pokemon?limit=2000') as any;
	const gen = new Generations(Dex, () => true).get(8);

	for (const {name} of data.results) {
		if (!gen.species.get(name)) {
			console.log(name);
		}
	}
})();
