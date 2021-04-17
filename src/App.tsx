import React, { useState, forwardRef, useRef, useMemo, memo, useCallback, useEffect } from 'react';
import { VariableSizeList as List } from 'react-window';
import memoize from 'memoize-one';
import AutoSizer from 'react-virtualized-auto-sizer';
import {Icons} from '@pkmn/img';
import {Dex} from '@pkmn/dex';
import {Generations, Generation, GenerationNum, Specie, SpeciesName, Type, TypeName} from '@pkmn/data';
import cls from 'classnames';
import './App.css';
import {getPokemonDetails} from './lib/pokeapi';

const sortedTypes: TypeName[] = [
	'Normal',
	'Fire',
	'Water',
	'Electric',
	'Grass',
	'Ice',
	'Fighting',
	'Poison',
	'Ground',
	'Flying',
	'Psychic',
	'Bug',
	'Rock',
	'Ghost',
	'Dragon',
	'Dark',
	'Steel',
	'Fairy'
];

const getGenerations = (showPast: boolean) => new Generations(Dex, d => {
	if (!d.exists) {
		return false;
	}

	if (d.kind === 'Ability' && d.id === 'noability') {
		return false;
	}

	const allowedNonstandard = showPast
		? ['Gigantamax', 'Past']
		: ['Gigantamax'];

	if ('isNonstandard' in d && d.isNonstandard && !allowedNonstandard.includes(d.isNonstandard)) {
		return false;
	}

	if ('tier' in d && d.tier === 'Unreleased') {
		return false;
	}

	return true;
});

const rowHeight = 65;
const wikiBase = 'https://bulbapedia.bulbagarden.net/wiki';

const typeColors: {[type in TypeName]: string} = {
	Normal: '#abab9d',
	Fire: '#FF6144',
	Water: '#52A9FF',
	Electric: '#fbc00f',
	Grass: '#7bbb61',
	Ice: '#83cef3',
	Fighting: '#C56F61',
	Poison: '#B76FA9',
	Ground: '#d8b95f',
	Flying: '#9AA9FF',
	Psychic: '#FF6EA8',
	Bug: '#aab73e',
	Rock: '#b7ae89',
	Ghost: '#7D7DC5',
	Dragon: '#8C7DF1',
	Dark: '#8C6F61',
	Steel: '#b0b0c1',
	Fairy: '#ef9def',
	'???': '#aaaaaa'
};

const multiplierLabels: {[multi: number]: string} = {
	'4': '4',
	'2': '2',
	'1': '1',
	'0.5': '1/2',
	'0.25': '1/4',
	'0': '0'
}

const getEvolutionBranchFactor = (gen: Generation, specie: Specie) => {
	let firstEvolution = specie;
	while (firstEvolution.prevo) {
		// eslint-disable-next-line no-loop-func
		firstEvolution = gen.species.get(firstEvolution.prevo)!;
	}

	let branches = 1;

	const q = [firstEvolution];
	while (q.length > 0) {
		const specie = q.pop()!;

		if ((specie.evos?.length ?? 0) > 0) {
			branches += specie.evos!.length - 1;
			q.push(...specie.evos!.map(name => gen.species.get(name)!));
		}
	}

	return branches;
}

const EvolutionConditionText = (props: {gen: Generation, specie: Specie}) => {
	const {gen, specie} = props;
	const needsLevelUp = ['levelMove', 'levelExtra', 'levelFriendship', 'levelHold'].includes(specie.evoType ?? '');
	const item = specie.evoItem ? gen.items.get(specie.evoItem) : undefined;
	const move = specie.evoMove ? gen.moves.get(specie.evoMove) : undefined;

	return (
		<div className="evolution-conditions" data-type={specie.evoType || 'level'}>
			{!specie.evoType && specie.evoLevel && (
				<div>Level {specie.evoLevel}</div>
			)}
			{needsLevelUp && (
				<div>Level up</div>
			)}
			{specie.evoType === 'trade' && (
				<div>Trade</div>
			)}
			{specie.evoType === 'useItem' && (
				<div data-item={item?.id}>
					Use
					<a target="_blank" rel="noreferrer" href={`${wikiBase}/${item?.name.replace(' ', '_')}`}>
						{specie.evoItem}
					</a>
				</div>
			)}
			{specie.evoType !== 'useItem' && specie.evoItem && (
				<div data-item={item?.id}>
					while holding
					<a target="_blank" rel="noreferrer" href={`${wikiBase}/${item?.name.replace(' ', '_')}`}>
						{specie.evoItem}
					</a>
				</div>
			)}
			{specie.evoType === 'other' && (
				<div>{specie.evoCondition}</div>
			)}
			{specie.evoType === 'levelFriendship' && (
				<div>
					with high
					<a target="_blank" rel="noreferrer" href={`${wikiBase}/Friendship`}>
						Friendship
					</a>
				</div>
			)}
			{specie.evoType === 'levelMove' && (
				<div data-move={move?.id}>
					with
					<a target="_blank" rel="noreferrer" href={`${wikiBase}/${move?.name.replace(' ', '_')}`}>
						{specie.evoMove}
					</a>
				</div>
			)}
			{specie.evoType !== 'other' && specie.evoCondition && (
				<div>{specie.evoCondition}</div>
			)}
		</div>
	);
};

const Evolution = (props: { gen: Generation, specie: Specie }) => {
	const {gen, specie} = props;

	let firstEvolution = specie;
	while (firstEvolution.prevo) {
		// eslint-disable-next-line no-loop-func
		firstEvolution = gen.species.get(firstEvolution.prevo)!;
	}

	const directEvolutionChain = [firstEvolution];

	let currentHead = directEvolutionChain[0];
	while (currentHead.evos?.length === 1) {
		// eslint-disable-next-line no-loop-func
		currentHead = gen.species.get(currentHead.evos[0])!;
		directEvolutionChain.push(currentHead);
	}

	const columns: Specie[][] = [];
	const q = [{specie: firstEvolution, depth: 0}];

	while (q.length > 0) {
		const node = q.pop();

		if (!columns[node!.depth]) {
			columns.push([]);
		}

		columns[node!.depth].push(node!.specie);

		for (const name of (node!.specie.evos ?? [])) {
			q.unshift({specie: gen.species.get(name)!, depth: node!.depth + 1});
		}
	}

	const columnRowCount: number[] = [];
	let currentMaxRows = 0;
	for (const col of columns) {
		currentMaxRows = Math.max(currentMaxRows, col.length);
		columnRowCount.push(currentMaxRows);
	}

	const vertical = currentMaxRows >= 3;

	return (
		<div className={cls('evolution', {col: vertical})}>
			{columns.length > 1 && columns.map((species, colIndex) => {
				const columnRows = columnRowCount[colIndex];
				const conditionElems: React.ReactNode[] = [];
				const pokemonElems: React.ReactNode[] = [];

				for (let k = 0; k < columnRows; k++) {
					if (k < species.length) {
						const spec = species[k];

						if (spec.prevo) {
							conditionElems.push(
								<EvolutionConditionText key={spec.name} gen={gen} specie={spec}/>
							);
						}

						pokemonElems.push(
							<div
								key={spec.name}
								className="evolution-pokemon"
								style={{height: `${rowHeight}px`}}
								title={spec.name}
								data-id={spec.id}
								data-num={spec.num}
							>
								<span style={Icons.getPokemon(spec.name).css}/>
							</div>
						)
					} else {
						conditionElems.push(<div key={`${colIndex}-${k}`} className={vertical ? 'col' : 'row'}/>);
						pokemonElems.push(<div key={`${colIndex}-${k}`} className={vertical ? 'col' : 'row'}/>);
					}
				}

				return (
					<React.Fragment key={colIndex}>
						{colIndex > 0 && (
							<div className={vertical ? 'row' : 'col'}>{conditionElems}</div>
						)}
						<div className={vertical ? 'row' : 'col'}>{pokemonElems}</div>
					</React.Fragment>
				);
			})}
		</div>
	);
};

interface RowItemData {
	gen: Generation;
	species: Specie[];
	expanded: SpeciesName[];
	onClickPokemon: (name: SpeciesName, index: number) => void;
}

const PokemonDetails = (props: {gen: Generation; specie: Specie}) => {
	const {gen, specie} = props;

	const types = sortedTypes.map(typeName => gen.types.get(typeName)).filter(Boolean) as Type[];
	types.sort((a, b) => b.totalEffectiveness(specie.types) - a.totalEffectiveness(specie.types));

	const branchFactor = getEvolutionBranchFactor(gen, specie);
	const verticalLayout = branchFactor >= 5;
	const maxTypeRows =
		branchFactor <= 2 ? 3
		: branchFactor <= 4 ? 4
		: 2;

	const typeColumns: Type[][] = [];
	types.forEach((type, i) => {
		if (i % maxTypeRows === 0) {
			typeColumns.push([]);
		}
		typeColumns[typeColumns.length - 1].push(type);
	});

	const damageMultipliers = (
		<div className="damage-multipliers">
			{typeColumns.map((cols, i) => {
				return (
					<div key={i} className="col">
						{cols.map(type => {
							const multi = type.totalEffectiveness(specie.types);
							return (
								<div key={type.id} className="damage-multiplier" data-multiplier={multi}>
									<div className="type" style={{backgroundColor: typeColors[type.name as TypeName]}}>
										{type.name.slice(0, 3)}
									</div>
									<div className="multiplier">
										{multiplierLabels[multi]}
									</div>
								</div>
							);
						})}
						{i === typeColumns.length - 1 && [...Array(maxTypeRows - typeColumns[i].length)].map(
							(_, j) => <div key={j} className="damage-multiplier" />
						)}
					</div>
				);
			})}
		</div>
	);

	const details = (
		<div className={verticalLayout ? 'col' : 'row'}>
			{!specie.prevo && !specie.evos ? (
				<div className="col">
					<div><em>{specie.name}</em> does not evolve</div>
				</div>
			) : (
				verticalLayout
					? <div className="row"><Evolution gen={gen} specie={specie}/></div>
					: <Evolution gen={gen} specie={specie}/>
			)}
			{verticalLayout
				? <div className="row">{damageMultipliers}</div>
				: damageMultipliers}
		</div>
	);

	return verticalLayout ? <div className="row">{details}</div> : details;
}

const Row = memo((props: { data: RowItemData, index: number, style: any }) => {
	const { gen, species, expanded, onClickPokemon } = props.data;
	const specie = species[props.index - 1] as Specie;

	const handleClickPokemon = useCallback(
		() => onClickPokemon(specie.name, props.index),
		[onClickPokemon, specie, props.index]
	);

	if (props.index === 0) {
		return null;
	}

	const isExpanded = expanded.includes(specie.name);

	return (
		<div
			style={props.style}
			className={cls('row', 'pokemon', {nonstandard: Boolean(specie.isNonstandard)})}
			data-nonstandard={specie.isNonstandard}
		>
			<div className="col">
				<div
					className={cls('row', 'expandable', {expanded: isExpanded})}
					onClick={handleClickPokemon}
					style={{flex: `0 0 ${rowHeight}px`, borderBottom: '1px solid rgba(0, 0, 0, 0.1)'}}
				>
					<div
						className="td"
						style={{justifyContent: 'center'}}
					>
						<span style={Icons.getPokemon(specie.name).css}/>
					</div>
					<div className="td">
						<div>
							<div className="name">
								<a
									target="_blank"
									rel="noreferrer"
									href={`${wikiBase}/${specie.baseSpecies.replace(' ', '_')}`}
								>
									{specie.baseSpecies}
								</a>
							</div>
							{specie.forme && (
								<div className="form-name">{specie.forme}</div>
							)}
						</div>
					</div>
					<div className="td">
						<div className="types">
							{specie.types.map(type => (
								<div key={type} className="type" style={{backgroundColor: typeColors[type]}}>
									{type}
								</div>
							))}
						</div>
					</div>
					<div className="td">
						<div className="abilities">
							{specie.abilities[0] && (
								<div>
									<a
										target="_blank"
										rel="noreferrer"
										href={`${wikiBase}/${specie.abilities[0].replace(' ', '_')}`}
										title={gen.abilities.get(specie.abilities[0])?.desc}
									>
										{specie.abilities[0]}
									</a>
								</div>
							)}
							{specie.abilities[1] && (
								<div>
									<a
										target="_blank"
										rel="noreferrer"
										href={`${wikiBase}/${specie.abilities[1].replace(' ', '_')}`}
										title={gen.abilities.get(specie.abilities[1])?.desc}
									>
										{specie.abilities[1]}
									</a>
								</div>
							)}
						</div>
					</div>
					<div className="td">
						<div className="abilities">
							{specie.abilities.H && (
								<div>
									<a
										target="_blank"
										rel="noreferrer"
										href={`${wikiBase}/${specie.abilities.H.replace(' ', '_')}`}
										title={gen.abilities.get(specie.abilities.H)?.desc}
									>
										{specie.abilities.H}
									</a>
								</div>
							)}
						</div>
					</div>
					<div className="td">
						<div className="col stat">
							<div>HP</div>
							<div>{specie.baseStats.hp}</div>
						</div>
						<div className="col stat">
							<div>Atk</div>
							<div>{specie.baseStats.atk}</div>
						</div>
						<div className="col stat">
							<div>Def</div>
							<div>{specie.baseStats.def}</div>
						</div>
						<div className="col stat">
							<div>SpA</div>
							<div>{specie.baseStats.spa}</div>
						</div>
						<div className="col stat">
							<div>SpD</div>
							<div>{specie.baseStats.spd}</div>
						</div>
						<div className="col stat">
							<div>Spe</div>
							<div>{specie.baseStats.spe}</div>
						</div>
					</div>
				</div>
				{isExpanded && (
					<PokemonDetails gen={gen} specie={specie} />
				)}
			</div>
		</div>
	);
});

const innerElementType = forwardRef(({ children, ...rest }, ref) => (
	<div ref={ref as any} {...rest} className="tbody">
		<div
			style={{top: 0, left: 0, width: 'auto', height: rowHeight}}
			className="header row sticky"
		>
			<div className="th" style={{justifyContent: 'center'}}>#</div>
			<div className="th">Name</div>
			<div className="th">Type</div>
			<div className="th">Abilities</div>
			<div className="th" aria-label="Hidden ability"></div>
			<div className="th">Stats</div>
		</div>
		{children}
	</div>
));

const outerElementType = forwardRef<any, any>(({ children, style, ...rest }, ref) => (
	<div ref={ref} style={{...style, overflowY: 'scroll'}} {...rest}>
		{children}
	</div>
));

const createItemData = memoize((gen: Generation, species: Specie[], expanded: SpeciesName[], onClickPokemon) => ({
	gen,
	species,
	expanded,
	onClickPokemon
}) as RowItemData);

function App() {
	const [searchText, setSearchText] = useState('');
	const [showPast, setShowPast] = useState(false);
	const [expanded, setExpanded] = useState<SpeciesName[]>([]);
	const [genNumber, setGenNumber] = useState<GenerationNum>(8);
	const listRef = useRef<List>();

	const gens = useMemo(
		() => getGenerations(showPast),
		[showPast]
	);

	const generation = useMemo(
		() => gens.get(genNumber),
		[gens, genNumber]
	);

	const genSpecies = useMemo(
		() => Array.from(generation.species).sort((a, b) => a.num - b.num),
		[generation]
	);

	const filteredSpecies = useMemo<Specie[]>(() =>
		genSpecies.filter(
			specie => searchText
				.toLowerCase()
				.split(' ')
				.every(s => specie.name.toLowerCase().includes(s))
		),
		[genSpecies, searchText]
	);

	useEffect(() => {
		if (filteredSpecies.length > 0) {
			setExpanded([filteredSpecies[0].name]);
			if (listRef.current) {
				(listRef.current as any).resetAfterIndex(0);
			}
		}
	}, [listRef, filteredSpecies]);

	const onClickPokemon = useCallback((name: SpeciesName, index) => {
		const idx = expanded.indexOf(name);

		const specie = generation.species.get(name)!;
		getPokemonDetails(specie);

		if (idx === -1) {
			setExpanded([...expanded, name]);
		} else {
			setExpanded(expanded.filter(i => i !== name));
		}

		(listRef.current as any).resetAfterIndex(index);
	}, [listRef, expanded]);

	const onChangeSearchText = useCallback(evt => {
		setSearchText(evt.target.value);
		(listRef.current as any).resetAfterIndex(0);
	}, [listRef]);

	const onChangeGen = useCallback((evt: React.ChangeEvent<HTMLSelectElement>) => {
		setGenNumber(Number(evt.target.value) as GenerationNum);
		(listRef.current as any).resetAfterIndex(0);
	}, [listRef]);

	const onToggleShowPast = useCallback(() => {
		setShowPast(!showPast);
		(listRef.current as any).resetAfterIndex(0);
	}, [listRef, showPast]);

	const getItemSize = useCallback(index => {
		if (index === 0) {
			return rowHeight;
		}

		const specie = filteredSpecies[index - 1] as Specie;

		if (!expanded.includes(specie.name)) {
			return rowHeight;
		}

		const branchFactor = getEvolutionBranchFactor(generation, specie);

		if (branchFactor >= 5) {
			return 5 * rowHeight + 65;
		}

		if (branchFactor >= 3) {
			return 4 * rowHeight + 1;
		}

		return rowHeight + (branchFactor * rowHeight) + 65;
	}, [filteredSpecies, generation, expanded]);

	const itemData = createItemData(generation, filteredSpecies, expanded, onClickPokemon);

	return (
		<div className="App">
			<div className="App-content">
				<div className="search">
					<input
						className="filter-name"
						placeholder="Filter by name"
						type="text"
						value={searchText}
						onChange={onChangeSearchText}
					/>
					<select
						className="filter-gen"
						value={genNumber}
						onChange={onChangeGen}
					>
						{[...Array(8)].map((_, idx) => (
							<option key={idx} value={(idx + 1) as GenerationNum}>Gen {idx + 1}</option>
						))}
					</select>
					<div className="filter-show-past" onClick={onToggleShowPast}>
						<input type="checkbox" checked={showPast} readOnly/>
						<label>Previous generations</label>
					</div>
				</div>
				<div className="App-table-wrapper">
					<div className="table">
						<AutoSizer>
							{({width, height}) => (
								<List
									width={width}
									height={height}
									itemSize={getItemSize}
									itemCount={filteredSpecies.length + 1}
									innerElementType={innerElementType}
									outerElementType={outerElementType}
									ref={listRef as any}
									itemData={itemData}
								>
									{Row}
								</List>
							)}
						</AutoSizer>
					</div>
				</div>
			</div>
		</div>
	);
}

export default App;
