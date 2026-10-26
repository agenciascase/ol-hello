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
export async function downloadDashboardPdf(selector: string, filename: string, options: {theme?: "light"|"dark"; singleA4?: boolean; longReport?: boolean} = {}) {
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
  clone.style.width=Math.max(980,Math.min(1100,element.scrollWidth))+"px";
  clone.style.maxWidth="none";
  clone.style.padding="24px";
  const dark=options.theme==="dark";
  const background=dark?"#071b14":"#f5f9f6";
  clone.style.background=background;
  clone.style.color=dark?"#f1fff7":"#142e21";
  clone.classList.add("scase-pdf-export");
  clone.classList.add(dark?"scase-pdf-dark":"scase-pdf-light");
  // Reproduce the selected theme without relying on the outer app shell.
  const exportStyle=document.createElement("style");
  exportStyle.textContent=`
  .scase-pdf-export{font-family:"Open Sans",Arial,sans-serif!important;background:${background}!important;color:${dark?"#f1fff7":"#142e21"}!important}
  .scase-pdf-export .panel,.scase-pdf-export .kpi,.scase-pdf-export .chartPanel{background:${dark?"#102b20":"#ffffff"}!important;color:${dark?"#f4fff8":"#152d21"}!important;border-color:${dark?"#22513a":"#dbe8df"}!important}
  .scase-pdf-export .panel *, .scase-pdf-export .kpi *{color:inherit}
  .scase-pdf-export .eyebrow{color:${dark?"#50e7a0":"#078e56"}!important}
  .scase-pdf-export .dashboardIntro{background:linear-gradient(110deg,#062519,#00552f)!important;color:#ffffff!important}
  .scase-pdf-export .dashboardIntro *, .scase-pdf-export .dashboardIntro strong{color:#ffffff!important}
  .scase-pdf-export .dashboardIntro .eyebrow,.scase-pdf-export .dashboardIntro small,.scase-pdf-export .dashboardIntro span{color:#c9f9e1!important}
  .scase-pdf-export .scase-priority-card{background:${dark?"#103b2b":"#ffffff"}!important;color:${dark?"#f1fff7":"#142e21"}!important;border-color:${dark?"#23694d":"#d9eade"}!important}
  .scase-pdf-export .scase-priority-card *{color:inherit!important}
  .scase-pdf-export .scase-priority-number{color:${dark?"#50e7a0":"#08764c"}!important}
  .scase-pdf-export .kpiTop,.scase-pdf-export .kpiBottom{color:inherit!important}
  .scase-pdf-export .kpi .kpiSymbol,.scase-pdf-export .kpi .kpiSymbol *{background:${dark?"#164d36":"#e2f9eb"}!important;color:#26e88c!important;stroke:#26e88c!important;fill:none!important;opacity:1!important}
  .scase-pdf-export .kpi .kpiSymbol svg,.scase-pdf-export .kpi .kpiSymbol path,.scase-pdf-export .kpi .kpiSymbol rect{stroke:#26e88c!important;stroke-width:2!important}
  .scase-pdf-export .dashboardIntro{grid-template-columns:minmax(0,36fr) minmax(0,36fr) minmax(0,28fr)!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;gap:12px!important;padding:20px 28px!important;overflow:hidden!important}
  .scase-pdf-export .dashboardIntro>div{min-width:0!important;max-width:100%!important;box-sizing:border-box!important;padding-right:4px!important;overflow-wrap:break-word!important}
  .scase-pdf-export .dashboardIntro>div:last-child{padding-right:0!important;padding-left:8px!important;text-align:right!important;justify-self:stretch!important;min-width:0!important}
  .scase-pdf-export .dashboardIntro>div:first-child strong{font-size:20px!important;line-height:1.27!important;overflow-wrap:anywhere!important;word-break:normal!important;white-space:normal!important}
  .scase-pdf-export .dashboardIntro>div:nth-child(2) strong{font-size:22px!important;line-height:1.3!important}
  .scase-pdf-export .dashboardIntro>div:last-child strong{font-size:15px!important;line-height:1.4!important;white-space:normal!important;overflow-wrap:anywhere!important}
  .scase-pdf-export .dashboardIntro small,.scase-pdf-export .dashboardIntro span{font-size:11px!important}
  /* Keep the results intelligence card together and eliminate compact/tangled rows in PDF. */
  .scase-pdf-export .scase-intelligence{margin-top:8px!important;margin-bottom:12px!important;padding-top:18px!important;padding-bottom:18px!important;height:auto!important;max-height:none!important;overflow:visible!important}
  .scase-pdf-export .scase-intelligence-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;align-items:start!important;gap:12px!important;height:auto!important;max-height:none!important;overflow:visible!important}
  .scase-pdf-export .scase-intelligence-tile{min-width:0!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;padding:12px!important}
  .scase-pdf-export .scase-intelligence-line{display:flex!important;flex-wrap:wrap!important;align-items:flex-start!important;justify-content:space-between!important;gap:3px 8px!important;padding:6px 0!important;line-height:1.45!important;white-space:normal!important}
  .scase-pdf-export .scase-intelligence-line span{flex:1 1 130px!important;min-width:0!important;white-space:normal!important;overflow-wrap:anywhere!important}
  .scase-pdf-export .scase-intelligence-line strong{flex:0 0 auto!important;white-space:normal!important;text-align:right!important}
  .scase-pdf-export .scase-intelligence-line small{display:block!important;white-space:normal!important}\n  .scase-pdf-export .scase-intelligence-tile h3{display:block!important;margin:0 0 10px!important;font-size:15px!important}\n  .scase-pdf-export .scase-intelligence-tile p{white-space:normal!important;line-height:1.5!important}
  .scase-pdf-export .panel{overflow:visible!important}

  .scase-pdf-export .chart,.scase-pdf-export .recharts-wrapper{background:transparent!important}
  `;
  clone.prepend(exportStyle);
  // Export content only. Never include edit controls, share links, agency navigation,
  // client selectors, or customization interfaces in client-facing PDFs.
  clone.querySelectorAll("button,input,select,textarea,.biShareBox,.biExport,.biDataWarning,.metricPicker,.metricPickerWrap,[draggable='true']").forEach(node=>{
    if(node.matches("[draggable='true']")){node.removeAttribute("draggable");return;}
    node.remove();
  });
  clone.querySelectorAll(".panelHead label,.biShareLink,.classicPdfActions,.dashboardModeBar,.filterBar,.sidebar,.topbar,.heading,.eyebrow").forEach(node=>{if(node.classList.contains("eyebrow")&&!(node.textContent||"").includes("PANORAMA EXECUTIVO"))return;node.remove();});
  const printHeading=document.createElement("div");
  printHeading.style.cssText="display:flex;align-items:center;gap:22px;background:#09251b;padding:20px 26px;border-radius:12px;color:white;margin-bottom:16px;font:700 22px 'Open Sans',Arial,sans-serif";
  const logo=document.createElement("img");logo.src="/scase-logo-light.svg";logo.style.cssText="width:170px;height:65px;object-fit:contain";
  const title=document.createElement("div");const clientName=element.dataset.reportClient?.trim();
  const period=element.dataset.reportPeriod?.trim();
  title.textContent="Relatório de desempenho";
  printHeading.append(logo,title);
  // Client name, strategic phrase and selected dates remain in the original report banner.
  clone.prepend(printHeading);
  const host=document.createElement("div");host.style.cssText="position:fixed;left:-20000px;top:0;z-index:-9999";
  // Restore the .perf ancestor required by performance.css selectors.
  // Without it, the detached report loses its grid and row styles during capture.
  host.className="perf"+(dark?" themeDark":"");
  host.style.width=clone.style.width;
  host.appendChild(clone);document.body.appendChild(host);
  try{
    await document.fonts.ready;
    await Promise.all(Array.from(clone.querySelectorAll("img")).map(img=>img.decode().catch(()=>undefined)));
    // Allow ResizeObservers in chart components to settle before capture.
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    // A cloned report can retain responsive/max-height styles and clip its last block.
    // Explicitly expand the export node after the browser has laid it out.
    clone.style.height="auto";
    clone.style.maxHeight="none";
    clone.style.overflow="visible";
    clone.querySelectorAll<HTMLElement>(".scase-intelligence,.scase-intelligence-grid,.scase-intelligence-tile,.panel,.chartPanel,.biView,.scase-client-report").forEach(node=>{
      node.style.height="auto";node.style.maxHeight="none";node.style.overflow="visible";
    });
    const measuredHeight=Math.max(clone.scrollHeight,Math.ceil(clone.getBoundingClientRect().height),...Array.from(clone.querySelectorAll<HTMLElement>("*")).map(node=>Math.ceil(node.getBoundingClientRect().bottom-clone.getBoundingClientRect().top+24)));
    clone.style.height=measuredHeight+"px";
    // Browser canvas implementations have finite image-size limits. html-to-image
    // silently rescales large captures unless explicitly configured, which can
    // crop the bottom of an unusually tall report.
    const captureWidth=clone.scrollWidth;
    const captureScale=Math.min(1.25,14000/measuredHeight,14000/captureWidth);
    const canvas=await current.htmlToImage.toCanvas(clone,{
      pixelRatio:captureScale,skipAutoScale:true,cacheBust:true,
      backgroundColor:background,width:captureWidth,height:measuredHeight
    });
    const expectedHeight=Math.round(measuredHeight*captureScale);
    if(canvas.height<expectedHeight-3)throw new Error("O relatório excedeu o limite de captura do navegador. Tente novamente.");
    if(!canvas.width||!canvas.height)throw new Error("Não foi possível capturar o relatório.");
    // Identify visual sections before converting DOM coordinates to canvas pixels.
    // Prefer page breaks between report cards/panels, never through their text.
    const rootRect=clone.getBoundingClientRect();
    const pixelScale=canvas.height/measuredHeight;
    const sections=Array.from(clone.querySelectorAll<HTMLElement>(
      ".panel,.chartPanel,.kpi,.scase-intelligence-tile,.scase-priority-card,.dashboardIntro,.scase-intelligence-grid"
    )).map(node=>{
      const rect=node.getBoundingClientRect();
      return {top:Math.max(0,Math.round((rect.top-rootRect.top)*pixelScale)),
        bottom:Math.min(canvas.height,Math.ceil((rect.bottom-rootRect.top)*pixelScale))};
    }).filter(rect=>rect.bottom>rect.top&&rect.top<canvas.height);
    await downloadCanvasPagesPdf(canvas,filename,{singleA4:options.singleA4===true,longReport:options.longReport===true,background,sections,singlePage:true});
  }finally{host.remove();}
}
async function downloadCanvasPagesPdf(canvas:HTMLCanvasElement,filename:string,options:{singleA4?:boolean;longReport?:boolean;background?:string;sections?:{top:number;bottom:number}[];singlePage?:boolean}={}){
 const encoder=new TextEncoder();const parts:Uint8Array[]=[];const offsets:number[]=[0];let offset=0;const add=(value:string|Uint8Array)=>{const bytes=typeof value==="string"?encoder.encode(value):value;parts.push(bytes);offset+=bytes.length};
 const object=(n:number,body:string|Uint8Array,prefix="",suffix="")=>{offsets[n]=offset;add(n+" 0 obj\n");if(prefix)add(prefix);add(body);if(suffix)add(suffix);add("\nendobj\n")};
 const singleA4=options.singleA4===true;
 const longReport=options.longReport===true;
 // The dashboard is exported as one continuous portrait page. Preserve its aspect
 // ratio and use PDF points (maximum dimension 14,400pt per ISO 32000).
 const singlePage=options.singlePage===true;
 const baseWidth=842,margin=singlePage?24:longReport?24:singleA4?0:22;
 // Every dashboard export follows the supplied reference: one A3 portrait page.
 // Fit the entire captured image within the printable area; never crop its bottom.
 const pageWidth=842,pageHeight=singlePage?1191:longReport?1191:595;
 const pageMargin=margin,contentWidth=pageWidth-2*pageMargin,contentHeight=pageHeight-2*pageMargin;
 const sliceHeight=singlePage||singleA4?canvas.height:Math.floor(canvas.width*contentHeight/contentWidth);
 // Use section-aware page boundaries. When a section cannot fit on one page,
 // split only that oversized section, rather than truncating or scaling it away.
 const pageSlices:{y:number;h:number}[]=[];
 let y=0;
 while(y<canvas.height){
  let end=Math.min(canvas.height,y+sliceHeight);
  if(!singlePage&&!singleA4&&end<canvas.height){
   const crossing=(options.sections??[]).filter(s=>s.top<end-2&&s.bottom>end+2&&s.top>y+4);
   const safeBreaks=crossing.map(s=>s.top).filter(top=>top-y>=sliceHeight*0.40);
   if(safeBreaks.length)end=Math.min(...safeBreaks);
  }
  if(end<=y)end=Math.min(canvas.height,y+sliceHeight);
  pageSlices.push({y,h:end-y});y=end;
 }
 const count=pageSlices.length;
 const images:Uint8Array[]=[];
 for(const {y,h} of pageSlices){
  const tile=document.createElement("canvas");tile.width=canvas.width;tile.height=h;
  const ctx=tile.getContext("2d");if(!ctx)throw new Error("Falha no PDF.");
  ctx.fillStyle=options.background??"white";ctx.fillRect(0,0,tile.width,tile.height);
  ctx.drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
  const bytes=await new Promise<Uint8Array>((resolve,reject)=>tile.toBlob(async blob=>blob?resolve(new Uint8Array(await blob.arrayBuffer())):reject(new Error("Falha ao criar página.")),"image/jpeg",.94));
  images.push(bytes);
 }
 add("%PDF-1.4\n");object(1,"<< /Type /Catalog /Pages 2 0 R >>");
 const ids=images.map((_,i)=>3+i*3);
 object(2,"<< /Type /Pages /Kids ["+ids.map(id=>id+" 0 R").join(" ")+"] /Count "+count+" >>");
 images.forEach((img,i)=>{
  const pageId=ids[i]! ,imageId=pageId+1,streamId=pageId+2;
  const height=pageSlices[i]!.h;
  const scale=singlePage?Math.min(contentWidth/canvas.width,contentHeight/height):contentWidth/canvas.width;
  const printedWidth=singleA4&&!singlePage?contentWidth:canvas.width*scale;
  const printedHeight=singleA4&&!singlePage?contentHeight:height*scale;
  const bg=(options.background??"#ffffff").replace("#","");
  const red=parseInt(bg.slice(0,2),16)/255,green=parseInt(bg.slice(2,4),16)/255,blue=parseInt(bg.slice(4,6),16)/255;
  const backdrop=`${red.toFixed(4)} ${green.toFixed(4)} ${blue.toFixed(4)} rg 0 0 ${pageWidth} ${pageHeight} re f\n`;
  const stream=backdrop+"q\n"+printedWidth+" 0 0 "+printedHeight+" "+((pageWidth-printedWidth)/2)+" "+(pageHeight-pageMargin-printedHeight)+" cm\n/Im1 Do\nQ\n";
  object(pageId,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+pageWidth+" "+pageHeight+"] /Resources << /XObject << /Im1 "+imageId+" 0 R >> >> /Contents "+streamId+" 0 R >>");
  object(imageId,img,"<< /Type /XObject /Subtype /Image /Width "+canvas.width+" /Height "+height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+img.length+" >>\nstream\n","\nendstream");
  object(streamId,"<< /Length "+encoder.encode(stream).length+" >>\nstream\n"+stream+"endstream");
 });
 const xref=offset;add("xref\n0 "+(3+count*3)+"\n0000000000 65535 f \n");for(let i=1;i<3+count*3;i++)add(String(offsets[i]).padStart(10,"0")+" 00000 n \n");
 add("trailer\n<< /Size "+(3+count*3)+" /Root 1 0 R >>\nstartxref\n"+xref+"\n%%EOF");
 const blob=new Blob(parts as BlobPart[],{type:"application/pdf"});const url=URL.createObjectURL(blob);
 const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
