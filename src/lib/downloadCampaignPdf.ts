export type ReportInput = {client:string;campaign:string;period:string;metrics:{label:string;value:string}[];notes?:string};
export async function downloadCampaignPdf(report:ReportInput) {
  const canvas=document.createElement("canvas");canvas.width=1240;canvas.height=1754;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Não foi possível gerar o PDF.");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,1240,1754);
  ctx.fillStyle="#082d20";ctx.fillRect(0,0,1240,225);
  try {const logo=new Image();logo.src="/scase-logo-light.svg";await new Promise<void>((resolve)=>{logo.onload=()=>resolve();logo.onerror=()=>resolve();setTimeout(resolve,3000)});if(logo.complete&&logo.naturalWidth)ctx.drawImage(logo,74,45,340,105);}catch{}
  ctx.fillStyle="#07e77e";ctx.font="bold 23px Arial";ctx.fillText("RELATÓRIO DE DESEMPENHO",75,185);
  ctx.fillStyle="#142e21";ctx.font="bold 39px Arial";ctx.fillText("Visão de campanha",75,300);
  ctx.font="22px Arial";ctx.fillStyle="#546c5d";
  const lines=[["Cliente",report.client],["Campanha",report.campaign],["Período",report.period]];
  lines.forEach(([label,value],i)=>{ctx.fillStyle="#778b7e";ctx.font="18px Arial";ctx.fillText(label ?? "",75,356+i*66);ctx.fillStyle="#193b26";ctx.font="bold 23px Arial";ctx.fillText((value ?? "").slice(0,70),230,356+i*66)});
  ctx.fillStyle="#087a48";ctx.font="bold 26px Arial";ctx.fillText("Indicadores do período",75,590);
  report.metrics.slice(0,16).forEach((m,i)=>{const x=75+(i%2)*550,y=625+Math.floor(i/2)*105;ctx.fillStyle="#f4faf6";ctx.fillRect(x,y,520,89);ctx.strokeStyle="#d7e9de";ctx.strokeRect(x,y,520,89);ctx.fillStyle="#65806c";ctx.font="17px Arial";ctx.fillText(m.label,x+20,y+31);ctx.fillStyle="#102f1d";ctx.font="bold 28px Arial";ctx.fillText(m.value,x+20,y+67)});
  ctx.fillStyle="#647c6b";ctx.font="17px Arial";ctx.fillText("SCASE Performance • Relatório gerado em "+new Date().toLocaleString("pt-BR"),75,1580);
  ctx.font="16px Arial";ctx.fillText("Os resultados apresentados podem ser demonstrativos. Confira a origem dos dados.",75,1610);
  const jpeg=await new Promise<Uint8Array>((resolve,reject)=>canvas.toBlob(async b=>{if(!b)return reject(new Error("Falha ao exportar"));resolve(new Uint8Array(await b.arrayBuffer()))},"image/jpeg",.89));
  const encoder=new TextEncoder();const parts:Uint8Array[]=[];let offset=0;const offsets:number[]=[0];
  function add(text:string|Uint8Array){const bytes=typeof text==="string"?encoder.encode(text):text;parts.push(bytes);offset+=bytes.length}
  function obj(n:number,body:string|Uint8Array,prefix="",suffix=""){offsets[n]=offset;add(n+" 0 obj\n");if(prefix)add(prefix);add(body);if(suffix)add(suffix);add("\nendobj\n")}
  add("%PDF-1.4\n");
  obj(1,"<< /Type /Catalog /Pages 2 0 R >>");
  obj(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>");
  obj(4,jpeg,"<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+jpeg.length+" >>\nstream\n","\nendstream");
  const stream="q\n595 0 0 842 0 0 cm\n/Im1 Do\nQ\n";
  obj(5,"<< /Length "+encoder.encode(stream).length+" >>\nstream\n"+stream+"endstream");
  const xref=offset;add("xref\n0 6\n0000000000 65535 f \n");for(let i=1;i<=5;i++)add(String(offsets[i]).padStart(10,"0")+" 00000 n \n");
  add("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF");
  const blob=new Blob(parts as BlobPart[],{type:"application/pdf"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="SCASE-Relatorio-"+report.campaign.replace(/[^a-z0-9-]/gi,"-").slice(0,38)+".pdf";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}


/**
 * Export the actual dashboard DOM as a downloadable, multi-page PDF.
 * Charts and typography are captured as rendered, rather than reconstructed.
 */
export async function downloadDashboardPdf(selector: string, filename: string) {
  const element=document.querySelector<HTMLElement>(selector);
  if(!element)throw new Error("A área do relatório não está disponível.");
  const source="https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js";
  type HtmlImageWindow=Window & {htmlToImage?:{toCanvas:(node:HTMLElement,options?:Record<string,unknown>)=>Promise<HTMLCanvasElement>}};
  const current=window as HtmlImageWindow;
  if(!current.htmlToImage){
    await new Promise<void>((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=source;script.crossOrigin="anonymous";
      script.onload=()=>resolve();
      script.onerror=()=>reject(new Error("Não foi possível carregar o gerador visual de PDF."));
      document.head.appendChild(script);
    });
  }
  if(!current.htmlToImage)throw new Error("Gerador visual indisponível.");
  const clone=element.cloneNode(true) as HTMLElement;
  clone.style.width=Math.max(1100,element.scrollWidth)+"px";
  clone.style.maxWidth="none";
  clone.style.padding="24px";
  clone.style.background="#f5f9f6";
  // Export content only. Never include edit controls, share links, agency navigation,
  // client selectors, or customization interfaces in client-facing PDFs.
  clone.querySelectorAll("button,input,select,textarea,.biShareBox,.biExport,.biDataWarning,.metricPicker,.metricPickerWrap,[draggable='true']").forEach(node=>{
    if(node.matches("[draggable='true']")){node.removeAttribute("draggable");return;}
    node.remove();
  });
  clone.querySelectorAll(".panelHead label,.biShareLink,.classicPdfActions,.dashboardModeBar,.filterBar,.sidebar,.topbar,.heading").forEach(node=>node.remove());
  const printHeading=document.createElement("div");
  printHeading.style.cssText="display:flex;align-items:center;gap:22px;background:#09251b;padding:20px 26px;border-radius:12px;color:white;margin-bottom:16px;font:700 22px 'Open Sans',Arial,sans-serif";
  const logo=document.createElement("img");logo.src="/scase-logo-light.svg";logo.style.cssText="width:170px;height:65px;object-fit:contain";
  const title=document.createElement("div");const clientName=element.dataset.reportClient?.trim();
  const period=element.dataset.reportPeriod?.trim();
  title.textContent=clientName ? clientName+(period?" · "+period:"") : "Relatório SCASE Performance";
  printHeading.append(logo,title);
  clone.prepend(printHeading);
  const host=document.createElement("div");host.style.cssText="position:fixed;left:-20000px;top:0;z-index:-9999";
  host.appendChild(clone);document.body.appendChild(host);
  try{
    await document.fonts.ready;
    // Allow ResizeObservers in chart components to settle before capture.
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    const canvas=await current.htmlToImage.toCanvas(clone,{pixelRatio:1.5,cacheBust:true,backgroundColor:"#f5f9f6",width:clone.scrollWidth,height:clone.scrollHeight});
    if(!canvas.width||!canvas.height)throw new Error("Não foi possível capturar o relatório.");
    await downloadCanvasPagesPdf(canvas,filename);
  }finally{host.remove();}
}
async function downloadCanvasPagesPdf(canvas:HTMLCanvasElement,filename:string){
 const encoder=new TextEncoder();const parts:Uint8Array[]=[];const offsets:number[]=[0];let offset=0;const add=(value:string|Uint8Array)=>{const bytes=typeof value==="string"?encoder.encode(value):value;parts.push(bytes);offset+=bytes.length};
 const object=(n:number,body:string|Uint8Array,prefix="",suffix="")=>{offsets[n]=offset;add(n+" 0 obj\n");if(prefix)add(prefix);add(body);if(suffix)add(suffix);add("\nendobj\n")};
 const pageWidth=842,pageHeight=595,margin=22,contentWidth=pageWidth-2*margin,contentHeight=pageHeight-2*margin;
 const sliceHeight=Math.floor(canvas.width*contentHeight/contentWidth);
 const count=Math.ceil(canvas.height/sliceHeight);
 const images:Uint8Array[]=[];
 for(let i=0;i<count;i++){
  const y=i*sliceHeight,h=Math.min(sliceHeight,canvas.height-y);
  const tile=document.createElement("canvas");tile.width=canvas.width;tile.height=h;
  const ctx=tile.getContext("2d");if(!ctx)throw new Error("Falha no PDF.");
  ctx.fillStyle="white";ctx.fillRect(0,0,tile.width,tile.height);
  ctx.drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
  const bytes=await new Promise<Uint8Array>((resolve,reject)=>tile.toBlob(async blob=>blob?resolve(new Uint8Array(await blob.arrayBuffer())):reject(new Error("Falha ao criar página.")),"image/jpeg",.94));
  images.push(bytes);
 }
 add("%PDF-1.4\n");object(1,"<< /Type /Catalog /Pages 2 0 R >>");
 const ids=images.map((_,i)=>3+i*3);
 object(2,"<< /Type /Pages /Kids ["+ids.map(id=>id+" 0 R").join(" ")+"] /Count "+count+" >>");
 images.forEach((img,i)=>{
  const pageId=ids[i]! ,imageId=pageId+1,streamId=pageId+2;
  const height=Math.min(sliceHeight,canvas.height-i*sliceHeight),printedHeight=height/canvas.width*contentWidth;
  const stream="q\n"+contentWidth+" 0 0 "+printedHeight+" "+margin+" "+(pageHeight-margin-printedHeight)+" cm\n/Im1 Do\nQ\n";
  object(pageId,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+pageWidth+" "+pageHeight+"] /Resources << /XObject << /Im1 "+imageId+" 0 R >> >> /Contents "+streamId+" 0 R >>");
  object(imageId,img,"<< /Type /XObject /Subtype /Image /Width "+canvas.width+" /Height "+height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+img.length+" >>\nstream\n","\nendstream");
  object(streamId,"<< /Length "+encoder.encode(stream).length+" >>\nstream\n"+stream+"endstream");
 });
 const xref=offset;add("xref\n0 "+(3+count*3)+"\n0000000000 65535 f \n");for(let i=1;i<3+count*3;i++)add(String(offsets[i]).padStart(10,"0")+" 00000 n \n");
 add("trailer\n<< /Size "+(3+count*3)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF");
 const blob=new Blob(parts as BlobPart[],{type:"application/pdf"});const url=URL.createObjectURL(blob);
 const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
