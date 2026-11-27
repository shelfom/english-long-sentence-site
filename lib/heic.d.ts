declare module 'heic-decode' {
  const api:{all(options:{buffer:Buffer}):Promise<Array<{width:number,height:number,decode():Promise<{width:number,height:number,data:Uint8ClampedArray}>}>&{dispose():void}>};
  export default api;
}
