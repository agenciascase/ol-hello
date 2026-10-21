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
  lines.forEach(([label,value],i)=>{ctx.fillStyle="#778b7e";ctx.font="18px Arial";ctx.fillText(label,75,356+i*66);ctx.fillStyle="#193b26";ctx.font="bold 23px Arial";ctx.fillText(value.slice(0,70),230,356+i*66)});
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
