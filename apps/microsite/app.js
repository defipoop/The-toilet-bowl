let lvl=0;
const meter=document.getElementById("meter");
document.getElementById("btn").addEventListener("click",()=>{
  lvl=Math.min(100,lvl+10);
  meter.style.width=lvl+"%";
});
