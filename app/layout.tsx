import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL('https://sentence.turtlebayedu.com'),title:'英语长难句分析智能体 · MBA',description:'先减后加，逐句读懂英文。An animated English sentence analyzer from Turtle Bay International Education.',openGraph:{title:'英语长难句分析智能体 · Minus Before Add',description:'看清主干，再读懂每一层修饰。',images:[{url:'/og.png',width:1200,height:630}],url:'https://sentence.turtlebayedu.com'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><head><link rel="stylesheet" href="/fonts/fonts.css"/></head><body>{children}</body></html>;}
