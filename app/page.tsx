import Studio from './Studio';
import examples from '../content/examples.json';
import {validate} from '../lib/validate';
export default function Page(){return <Studio examples={examples.map(x=>validate(x,x.original))}/>;}
