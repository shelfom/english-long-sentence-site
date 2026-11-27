import Studio from './Studio';
import examples from '../content/examples.json';
export default function Page(){return <Studio examples={examples.map(x=>x.original)}/>;}
