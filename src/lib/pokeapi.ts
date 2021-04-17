import {Dex} from '@pkmn/dex';
import {Specie, Generations} from '@pkmn/data';
import axios from 'axios';

const apiUrl = 'https://pokeapi.co/api/v2';
let smogonIdToPokeAPIId: Map<string, string>;

interface PokemonListResponse {
	results: Array<{name: string}>;
}

interface PokemonDetailsResponse {
	results: Array<{name: string}>;
}

async function getPokeAPIName(specie: Specie) {
	if (!smogonIdToPokeAPIId) {
		smogonIdToPokeAPIId = new Map<string, string>();

		const {data} = await axios.get<PokemonListResponse>(`${apiUrl}/pokemon?limit=2000`);
		const gen = new Generations(Dex, () => true).get(8);

		for (const {name} of data.results) {
			const specie = gen.species.get(name);
			if (specie) {
				smogonIdToPokeAPIId.set(specie.id, name);
			}
		}
	}

	return smogonIdToPokeAPIId.get(specie.id);
}

export async function getPokemonDetails(specie: Specie) {
	const pokeAPIName = await getPokeAPIName(specie);
	const {data} = await axios.get<PokemonDetailsResponse>(`${apiUrl}/pokemon/${pokeAPIName}`);

	console.log(data);
}

