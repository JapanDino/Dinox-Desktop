/// Geometry only: works with physical desktop coordinates, including negative origins.
#[derive(Clone,Copy,Debug)]
pub struct Bounds { pub x:i32,pub y:i32,pub width:i32,pub height:i32 }
/// Undo only our own last AppBar strip; all other work-area reservations stay.
pub fn dock_available_bounds(monitor:Bounds,mut work:Bounds,own:Option<Bounds>,edge:&str)->Bounds {
 let (mut right,mut bottom)=(work.x+work.width,work.y+work.height);
 if let Some(old)=own {
  match edge {
   "left" if (work.x-(old.x+old.width)).abs()<=2=>work.x=old.x,
   "right" if (right-old.x).abs()<=2=>right=old.x+old.width,
   "bottom" if (bottom-old.y).abs()<=2=>bottom=old.y+old.height,
   _=>{}
  }
 }
 work.x=work.x.clamp(monitor.x,monitor.x+monitor.width-1);
 work.y=work.y.clamp(monitor.y,monitor.y+monitor.height-1);
 right=right.clamp(work.x+1,monitor.x+monitor.width);
 bottom=bottom.clamp(work.y+1,monitor.y+monitor.height);
 Bounds{x:work.x,y:work.y,width:right-work.x,height:bottom-work.y}
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct MonitorSignature {x:i32,y:i32,width:u32,height:u32,dpi_thousandths:u32}
impl MonitorSignature {pub fn new(x:i32,y:i32,width:u32,height:u32,scale:f64)->Self{Self{x,y,width,height,dpi_thousandths:if scale.is_finite()&&scale>0.0{(scale*1000.0).round() as u32}else{1000}}}}
pub fn edge_activation(position:&str,monitor:Bounds,pill:Bounds,cursor:(i32,i32),scale:f64)->bool {
 let hot=(8.0*scale).round() as i32;
 let span=(pill.width.max((220.0*scale) as i32)).min((400.0*scale) as i32).min(monitor.width);
 let cy=monitor.y+((monitor.height as f64*0.2).min(180.0*scale)+22.0*scale) as i32;
 match position {
  "left"=>cursor.0>=monitor.x&&cursor.0<=monitor.x+hot&&(cursor.1-cy).abs()<=(120.0*scale) as i32,
  "right"=>cursor.0<=monitor.x+monitor.width&&cursor.0>=monitor.x+monitor.width-hot&&(cursor.1-cy).abs()<=(120.0*scale) as i32,
  "bottom"=>cursor.1<=monitor.y+monitor.height&&cursor.1>=monitor.y+monitor.height-hot&&(cursor.0-(pill.x+pill.width/2)).abs()<=span/2,
  _=>{
   let x=match position {"top-left"=>pill.x,"top-right"=>pill.x+pill.width-span,_=>pill.x+(pill.width-span)/2};
   cursor.1>=monitor.y&&cursor.1<=monitor.y+hot&&cursor.0>=x&&cursor.0<=x+span
  }
 }
}
pub fn contains_visible(bounds:Bounds,cursor:(i32,i32),visible:bool)->bool {visible&&bounds.width>0&&bounds.height>0&&cursor.0>=bounds.x&&cursor.0<=bounds.x+bounds.width&&cursor.1>=bounds.y&&cursor.1<=bounds.y+bounds.height}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn hidden_rectangle_never_captures_browser_tabs(){assert!(!contains_visible(Bounds{x:200,y:0,width:300,height:44},(300,20),false));}
 #[test]fn activation_is_narrow_and_accounts_for_negative_monitor_origin(){let m=Bounds{x:-1920,y:0,width:1920,height:1080};let p=Bounds{x:-1080,y:0,width:240,height:44};assert!(edge_activation("top-center",m,p,(-960,3),1.0));assert!(!edge_activation("top-center",m,p,(-1700,3),1.0));assert!(edge_activation("right",m,p,(-1,262),1.0));assert!(!edge_activation("right",m,p,(-1,700),1.0));}
 #[test]fn actual_y_origin_is_respected(){let b=Bounds{x:500,y:700,width:300,height:100};assert!(!contains_visible(b,(600,20),true));assert!(contains_visible(b,(600,720),true));}
 #[test]fn display_signature_tracks_primary_origin_size_and_dpi(){let a=MonitorSignature::new(-1920,100,1920,1080,1.0);assert_ne!(a,MonitorSignature::new(0,100,1920,1080,1.0));assert_ne!(a,MonitorSignature::new(-1920,100,2560,1440,1.0));assert_ne!(a,MonitorSignature::new(-1920,100,1920,1080,1.25));assert_eq!(a,MonitorSignature::new(-1920,100,1920,1080,f64::NAN));}
 #[test]fn compatible_dock_preserves_windows_taskbar_and_removes_only_own_strip(){
  let m=Bounds{x:0,y:0,width:1440,height:900};let own=Bounds{x:0,y:776,width:1440,height:76};
  let safe=dock_available_bounds(m,Bounds{x:0,y:0,width:1440,height:776},Some(own),"bottom");
  assert_eq!(safe.y+safe.height,852);
  assert_eq!(dock_available_bounds(m,Bounds{x:0,y:0,width:1440,height:852},None,"bottom").height,852);
 }
 #[test]fn side_dock_preserves_other_edge_bars_and_negative_origins(){
  let m=Bounds{x:-1440,y:100,width:1440,height:900};
  let safe=dock_available_bounds(m,Bounds{x:-1364,y:130,width:1364,height:822},Some(Bounds{x:-1440,y:130,width:76,height:822}),"left");
  assert_eq!(safe.x,-1440);assert_eq!(safe.y,130);assert_eq!(safe.y+safe.height,952);
 }
}
