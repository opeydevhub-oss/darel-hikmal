/* Darel Hikmah EMIS-style lesson workflow.
   Adds structured five-stage lesson plans and separate PDF lesson-note uploads. */
(function () {
  "use strict";
  if (!window.PortalData || !window.PortalDashboard || !window.SupabaseClient) return;
  var client = window.SupabaseClient.getClient();
  if (!client) return;

  function esc(v) { return window.portalEscape ? window.portalEscape(v == null ? "" : v) : String(v || "").replace(/[&<>"]/g, function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]);}); }
  function dateText(v) { return v ? new Date(v + "T00:00:00").toLocaleDateString() : "—"; }
  function section(v) { return String(v || "").toLowerCase() === "basic" ? "Primary" : (v || ""); }
  function subjectOptions(panel, classId, selected) {
    var rows = (panel.teachingOptions || []).filter(function(x){return x.class_id === classId;});
    var seen = {}, html = '<option value="">Choose subject…</option>';
    rows.forEach(function(x){
      var key = x.subject_id || "__general__";
      if (seen[key]) return; seen[key] = true;
      html += '<option value="' + key + '"' + (selected === (x.subject_id || null) ? " selected" : "") + '>' + esc(x.subject_name || "General / Integrated learning") + '</option>';
    });
    return html;
  }
  function classOptions(panel, selected) {
    var seen = {}, html = '<option value="">Choose assigned class…</option>';
    (panel.teachingOptions || []).forEach(function(x){
      if (seen[x.class_id]) return; seen[x.class_id] = true;
      var label = [x.class_name, section(x.class_level), x.arm].filter(Boolean).join(" · ");
      html += '<option value="' + esc(x.class_id) + '"' + (selected === x.class_id ? " selected" : "") + '>' + esc(label) + '</option>';
    });
    return html;
  }
  function field(label, name, value, type, required) {
    return '<label class="emis-field">' + label + '<input class="form-control" name="' + name + '" type="' + (type || "text") + '"' +
      (required ? " required" : "") + ' value="' + esc(value || "") + '"></label>';
  }
  function area(label, name, value, rows, required) {
    return '<label class="emis-field">' + label + '<textarea class="form-control" name="' + name + '" rows="' + (rows || 3) + '"' +
      (required ? " required" : "") + '>' + esc(value || "") + '</textarea></label>';
  }
  var stages = [
    ["previous_knowledge","STEP I: PREVIOUS KNOWLEDGE"],
    ["exploration","STEP II: EXPLORATION"],
    ["discussion","STEP III: DISCUSSION"],
    ["application","STEP IV: APPLICATION"],
    ["evaluation","STEP V: EVALUATION"]
  ];
  function stageMarkup(key, label, saved) {
    saved = saved || {};
    return '<section class="panel mt-1 emis-stage"><h3>' + label + '</h3>' +
      '<label class="emis-field">Mode<select class="form-control" name="stage_' + key + '_mode">' +
      ['Select','Individual','Group'].map(function(v){return '<option' + (saved.mode === v ? ' selected' : '') + '>' + v + '</option>';}).join("") +
      '</select></label>' +
      area("Teacher’s Activities", "stage_" + key + "_teacher", saved.teacher, 3, false) +
      area("Students’ Activities", "stage_" + key + "_students", saved.students, 3, false) +
      '</section>';
  }
  function planEditor(dashboard, panel, record) {
    if (!panel.termId || !panel.sessionId) { window.alert("The administrator must set the current academic session and term first."); return; }
    var dialog = document.getElementById("emis-plan-editor");
    if (!dialog) { dialog = document.createElement("dialog"); dialog.id = "emis-plan-editor"; dialog.className = "portal-editor-dialog"; document.body.appendChild(dialog); }
    var stagesSaved = record && record.lesson_stages || {};
    var cls = record && record.class_id || (panel.teachingOptions[0] && panel.teachingOptions[0].class_id);
    var subj = record && record.subject_id || null;
    var planDate = record && record.plan_date || record && record.week_start || "";
    dialog.innerHTML = '<form id="emis-plan-form" class="form-stack">' +
      '<div class="panel__head"><div><span class="eyebrow">Staff workspace</span><h2>' + (record ? "Edit lesson plan" : "Write lesson plan") + '</h2><p>' + esc(panel.termName || "") + '</p></div>' +
      '<button type="button" class="btn btn--ghost btn--small" data-emis-close>Close</button></div>' +
      '<div class="form-grid">' + field("Date","plan_date",planDate,"date",true) +
      field("Plan title","title",record && record.title,"text",true) +
      field("No. in class","class_size",record && record.class_size,"number",false) +
      field("Average age","average_age",record && record.average_age,"number",false) +
      '</div><label class="emis-field">Class<select class="form-control" name="class_id" required>' + classOptions(panel,cls) + '</select></label>' +
      '<label class="emis-field">Subject<select class="form-control" name="subject_id" required>' + subjectOptions(panel,cls,subj) + '</select></label>' +
      '<div class="form-grid">' + field("Topic","topic",record && record.topic,"text",true) +
      field("Sub-topic","subtopic",record && record.subtopic,"text",false) +
      field("Time (from)","time_from",record && record.time_from,"time",false) +
      field("Time (to)","time_to",record && record.time_to,"time",false) +
      field("Duration","duration",record && record.duration,"text",false) + '</div>' +
      area("Learning Materials","instructional_materials",record && record.instructional_materials,2,false) +
      area("Lesson Objectives","learning_objectives",record && record.learning_objectives,3,true) +
      stages.map(function(s){return stageMarkup(s[0],s[1],stagesSaved[s[0]]);}).join("") +
      area("References","references_text",record && record.references_text,2,false) +
      area("Assignment","assignment",record && record.assignment,2,false) +
      '<p class="notice" data-emis-message hidden role="status"></p>' +
      '<div class="btn-row"><button type="button" class="btn btn--outline-navy" data-emis-save="draft">Save draft</button>' +
      '<button type="button" class="btn btn--primary" data-emis-save="submitted">Submit for review</button></div></form>';
    if (dialog.open) dialog.close(); dialog.showModal();
    var form = dialog.querySelector("form"), msg = form.querySelector("[data-emis-message]");
    form.querySelector("[data-emis-close]").onclick = function(){dialog.close();};
    form.querySelector('[name="class_id"]').onchange = function(){
      form.querySelector('[name="subject_id"]').innerHTML = subjectOptions(panel,this.value,null);
    };
    form.querySelectorAll("[data-emis-save]").forEach(function(btn){
      btn.onclick = function(){
        if (!form.reportValidity()) return;
        var d = new FormData(form), date = String(d.get("plan_date") || ""), from = String(d.get("time_from") || ""), to = String(d.get("time_to") || "");
        if (from && to && to <= from) { msg.hidden=false; msg.className="notice notice--error"; msg.textContent="Time to must be later than time from."; return; }
        var stageData = {};
        stages.forEach(function(s){ stageData[s[0]] = {
          mode: String(d.get("stage_"+s[0]+"_mode") || "Select"),
          teacher: String(d.get("stage_"+s[0]+"_teacher") || "").trim(),
          students: String(d.get("stage_"+s[0]+"_students") || "").trim()
        }; });
        var status = btn.getAttribute("data-emis-save");
        var payload = {
          class_id:d.get("class_id"), subject_id:d.get("subject_id")==="__general__"?null:d.get("subject_id"),
          session_id:panel.sessionId, term_id:panel.termId, plan_date:date, week_start:date, week_end:date,
          title:String(d.get("title")||"").trim(), topic:String(d.get("topic")||"").trim(),
          subtopic:String(d.get("subtopic")||"").trim(), class_size:d.get("class_size")?Number(d.get("class_size")):null,
          average_age:d.get("average_age")?Number(d.get("average_age")):null,
          time_from:from||null,time_to:to||null,duration:String(d.get("duration")||"").trim(),
          instructional_materials:String(d.get("instructional_materials")||"").trim(),
          learning_objectives:String(d.get("learning_objectives")||"").trim(),
          previous_knowledge:stageData.previous_knowledge.teacher,
          introduction:stageData.exploration.teacher,
          lesson_development:stageData.discussion.teacher,
          teacher_activities:stageData.application.teacher, learner_activities:stageData.application.students,
          evaluation:stageData.evaluation.teacher, references_text:String(d.get("references_text")||"").trim(),
          assignment:String(d.get("assignment")||"").trim(), lesson_stages:stageData, status:status
        };
        form.querySelectorAll("button").forEach(function(b){b.disabled=true;});
        msg.hidden=false; msg.className="notice notice--info"; msg.textContent=status==="draft"?"Saving draft…":"Submitting lesson plan…";
        var req = record ? window.PortalData.updateLessonPlan(record.id,payload) : window.PortalData.createLessonPlan(payload);
        req.then(function(res){if(res.error) throw new Error(res.error.message); dialog.close(); dashboard.refresh();})
          .catch(function(e){msg.hidden=false;msg.className="notice notice--error";msg.textContent=e.message||"Could not save lesson plan.";form.querySelectorAll("button").forEach(function(b){b.disabled=false;});});
      };
    });
  }
  function noteUpload(dashboard,panel) {
    if (!panel.termId || !panel.sessionId) { window.alert("The administrator must set the current academic session and term first."); return; }
    var dialog=document.getElementById("emis-note-upload");
    if(!dialog){dialog=document.createElement("dialog");dialog.id="emis-note-upload";dialog.className="portal-editor-dialog";document.body.appendChild(dialog);}
    var cls=panel.teachingOptions[0]&&panel.teachingOptions[0].class_id;
    dialog.innerHTML='<form id="emis-note-form" class="form-stack"><div class="panel__head"><div><span class="eyebrow">Staff workspace</span><h2>Upload lesson note</h2><p>PDF only. File must be less than 1 MB.</p></div><button type="button" class="btn btn--ghost btn--small" data-note-close>Close</button></div>' +
      '<label class="emis-field">Class<select class="form-control" name="class_id" required>'+classOptions(panel,cls)+'</select></label>' +
      '<label class="emis-field">Subject<select class="form-control" name="subject_id" required>'+subjectOptions(panel,cls,null)+'</select></label>' +
      field("Topic","topic","","text",true) +
      '<label class="emis-field">Lesson note (PDF)<input class="form-control" type="file" name="file" accept="application/pdf,.pdf" required></label>' +
      '<p class="notice" data-note-message hidden role="status"></p><div class="btn-row"><button class="btn btn--primary" type="submit">Upload & submit</button></div></form>';
    if(dialog.open)dialog.close();dialog.showModal();
    var form=dialog.querySelector("form"),msg=form.querySelector("[data-note-message]");
    form.querySelector("[data-note-close]").onclick=function(){dialog.close();};
    form.querySelector('[name="class_id"]').onchange=function(){form.querySelector('[name="subject_id"]').innerHTML=subjectOptions(panel,this.value,null);};
    form.onsubmit=function(ev){
      ev.preventDefault(); if(!form.reportValidity())return;
      var file=form.querySelector('[name="file"]').files[0];
      if(!file)return;
      if(file.type!=="application/pdf" && !/\.pdf$/i.test(file.name)){msg.hidden=false;msg.className="notice notice--error";msg.textContent="Only PDF files are allowed.";return;}
      if(file.size>=1048576){msg.hidden=false;msg.className="notice notice--error";msg.textContent="The PDF must be less than 1 MB.";return;}
      var data=new FormData(form), subject=data.get("subject_id"), userId=null;
      form.querySelectorAll("button").forEach(function(b){b.disabled=true;});
      msg.hidden=false;msg.className="notice notice--info";msg.textContent="Uploading PDF…";
      client.auth.getUser().then(function(auth){
        userId=auth.data.user.id;
        var id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(16).slice(2);
        var path=userId+"/"+id+".pdf";
        return client.storage.from("lesson-notes").upload(path,file,{contentType:"application/pdf",upsert:false})
          .then(function(up){if(up.error)throw up.error;
            return client.from("staff").select("id").eq("profile_id",userId).eq("status","active").single();
          }).then(function(staff){
            if(staff.error)throw staff.error;
            return client.from("lesson_notes").insert({
              staff_id:staff.data.id,class_id:data.get("class_id"),subject_id:subject==="__general__"?null:subject,
              session_id:panel.sessionId,term_id:panel.termId,topic:String(data.get("topic")||"").trim(),
              file_name:file.name,storage_path:path,file_size:file.size,status:"submitted"
            });
          });
      }).then(function(res){if(res&&res.error)throw res.error;dialog.close();dashboard.refresh();})
      .catch(function(e){msg.hidden=false;msg.className="notice notice--error";msg.textContent=e.message||"Upload failed.";form.querySelectorAll("button").forEach(function(b){b.disabled=false;});});
    };
  }
  function openPdf(path) {
    client.storage.from("lesson-notes").createSignedUrl(path,60).then(function(r){
      if(r.error)throw r.error; window.open(r.data.signedUrl,"_blank","noopener");
    }).catch(function(e){window.alert(e.message||"Could not open PDF.");});
  }
  function staffPanel(panel) {
    if(panel.error)return '<p class="notice notice--error">'+esc(panel.error)+'</p>';
    var html='<div class="btn-row"><button class="btn btn--primary" data-emis-write-plan type="button">Write lesson plan</button><button class="btn btn--outline-navy" data-emis-upload-note type="button">Upload lesson note</button></div>' +
      '<p class="muted mt-1">Current term: '+esc(panel.termName||"Not set")+'</p>';
    if(!panel.teachingOptions.length) return html+'<div class="empty-state"><h3>No teaching assignments</h3><p>An administrator must assign you a class and subject first.</p></div>';
    html+='<h3 class="mt-2">View lesson plans</h3>';
    if(!panel.lessonPlans.length)html+='<p class="muted">No lesson plans saved yet.</p>';
    (panel.lessonPlans||[]).forEach(function(p){
      html+='<article class="record"><div class="record__top"><h3 class="record__title">'+esc(p.title)+'</h3><span class="badge badge--'+(p.status==="approved"?"ok":p.status==="submitted"?"due":"muted")+'">'+esc(p.status)+'</span></div>' +
        '<p class="record__meta">'+esc(p.class&&p.class.name||"Class")+' · '+esc(p.subject&&p.subject.name||"Subject")+' · '+dateText(p.plan_date||p.week_start)+'</p><p><strong>Topic:</strong> '+esc(p.topic)+'</p>' +
        (p.review_comment?'<p class="notice notice--warn">Feedback: '+esc(p.review_comment)+'</p>':'')+
        ((p.status==="draft"||p.status==="revision_requested")?'<button type="button" class="btn btn--small btn--outline-navy" data-emis-edit-plan="'+esc(p.id)+'">Edit plan</button>':'')+'</article>';
    });
    html+='<h3 class="mt-2">View lesson notes</h3>';
    if(!panel.lessonNotes.length)html+='<p class="muted">No lesson notes uploaded yet.</p>';
    (panel.lessonNotes||[]).forEach(function(n){
      html+='<article class="record"><div class="record__top"><h3 class="record__title">'+esc(n.topic)+'</h3><span class="badge">'+esc(n.status)+'</span></div><p class="record__meta">'+esc(n.class&&n.class.name||"Class")+' · '+esc(n.subject&&n.subject.name||"Subject")+' · '+dateText(n.created_at.slice(0,10))+'</p><button type="button" class="btn btn--small btn--outline-navy" data-emis-open-pdf="'+esc(n.storage_path)+'">View PDF</button>'+(n.review_comment?'<p class="notice notice--warn">Feedback: '+esc(n.review_comment)+'</p>':'')+'</article>';
    });
    return html;
  }
  function adminPanel(panel) {
    var html='';
    if(panel.error)return '<p class="notice notice--error">'+esc(panel.error)+'</p>';
    if(!panel.lessonPlans.length)html+='<p class="muted">No lesson plans submitted.</p>';
    (panel.lessonPlans||[]).forEach(function(p){
      html+='<article class="record"><div class="record__top"><h3 class="record__title">'+esc(p.title)+'</h3><span class="badge">'+esc(p.status)+'</span></div><p class="record__meta">'+esc(p.staff&&p.staff.full_name||"Staff")+' · '+esc(p.class&&p.class.name||"Class")+' · '+esc(p.subject&&p.subject.name||"Subject")+'</p><p><strong>Topic:</strong> '+esc(p.topic)+'</p><details><summary>Read lesson plan</summary><p>'+esc(p.learning_objectives)+'</p><p>'+esc(p.lesson_development)+'</p><pre style="white-space:pre-wrap">'+esc(JSON.stringify(p.lesson_stages||{},null,2))+'</pre></details>'+(p.status==="submitted"?'<div class="btn-row"><button type="button" class="btn btn--primary btn--small" data-emis-review-plan="'+p.id+'" data-status="approved">Approve</button><button type="button" class="btn btn--outline-navy btn--small" data-emis-review-plan="'+p.id+'" data-status="revision_requested">Request revision</button></div><textarea class="form-control" data-plan-comment="'+p.id+'" placeholder="Feedback for teacher"></textarea>':'')+'</article>';
    });
    return html;
  }
  var oldStaff=window.PortalData.getStaffDashboard;
  window.PortalData.getStaffDashboard=function(){
    return oldStaff.call(window.PortalData).then(function(res){
      if(!res||!res.data)return res;
      var panel=(res.data.panels||[]).find(function(p){return p.id==="lesson-plans";});
      if(!panel)return res;
      return client.auth.getUser().then(function(a){
        var uid=a.data.user&&a.data.user.id;
        return client.from("lesson_notes").select("id,topic,file_name,storage_path,file_size,status,review_comment,created_at,class:classes(name),subject:subjects(name)").order("created_at",{ascending:false})
          .then(function(n){panel.lessonNotes=n.data||[];if(n.error)panel.noteError=n.error.message;return res;});
      });
    });
  };
  var oldAdmin=window.PortalData.getAdminDashboard;
  window.PortalData.getAdminDashboard=function(){
    return oldAdmin.call(window.PortalData).then(function(res){
      if(!res||!res.data)return res;
      return client.from("lesson_notes").select("id,staff_id,topic,file_name,storage_path,file_size,status,review_comment,created_at,staff:staff(full_name),class:classes(name),subject:subjects(name)").order("created_at",{ascending:false})
        .then(function(n){res.data.panels.push({id:"lesson-notes-admin",title:"Lesson Note Reviews",intro:"Review uploaded PDF lesson notes.",kind:"emis-lesson-notes-admin",lessonNotes:n.data||[],error:n.error&&n.error.message});return res;});
    });
  };
  var oldBody=window.PortalDashboard.panelBody;
  window.PortalDashboard.panelBody=function(panel,empty){
    if(!empty&&panel.kind==="lesson-plans-staff")return staffPanel(panel);
    if(!empty&&panel.kind==="lesson-plans-admin")return adminPanel(panel);
    if(!empty&&panel.kind==="emis-lesson-notes-admin"){
      if(panel.error)return '<p class="notice notice--error">'+esc(panel.error)+'</p>';
      if(!panel.lessonNotes.length)return '<p class="muted">No lesson notes submitted.</p>';
      return panel.lessonNotes.map(function(n){return '<article class="record"><div class="record__top"><h3 class="record__title">'+esc(n.topic)+'</h3><span class="badge">'+esc(n.status)+'</span></div><p class="record__meta">'+esc(n.staff&&n.staff.full_name||"Staff")+' · '+esc(n.class&&n.class.name||"Class")+' · '+esc(n.subject&&n.subject.name||"Subject")+'</p><button type="button" class="btn btn--small btn--outline-navy" data-emis-open-pdf="'+esc(n.storage_path)+'">View PDF</button>'+(n.status==="submitted"?'<textarea class="form-control" data-note-comment="'+n.id+'" placeholder="Feedback for teacher"></textarea><div class="btn-row"><button class="btn btn--primary btn--small" data-emis-review-note="'+n.id+'" data-status="approved">Approve</button><button class="btn btn--outline-navy btn--small" data-emis-review-note="'+n.id+'" data-status="revision_requested">Request revision</button></div>':'')+'</article>';}).join("");
    }
    return oldBody.call(this,panel,empty);
  };
  var oldRender=window.PortalDashboard.renderPanels;
  window.PortalDashboard.renderPanels=function(){
    oldRender.call(this);
    var dashboard=this, root=document.querySelector("[data-dash-panels]");
    if(!root||!this.config)return;
    root.querySelectorAll("[data-emis-write-plan]").forEach(function(b){b.onclick=function(){var p=dashboard.config.panels.find(function(x){return x.id==="lesson-plans";});planEditor(dashboard,p,null);};});
    root.querySelectorAll("[data-emis-upload-note]").forEach(function(b){b.onclick=function(){var p=dashboard.config.panels.find(function(x){return x.id==="lesson-plans";});noteUpload(dashboard,p);};});
    root.querySelectorAll("[data-emis-edit-plan]").forEach(function(b){b.onclick=function(){var p=dashboard.config.panels.find(function(x){return x.id==="lesson-plans";});var r=p.lessonPlans.find(function(x){return x.id===b.getAttribute("data-emis-edit-plan");});planEditor(dashboard,p,r);};});
    root.querySelectorAll("[data-emis-open-pdf]").forEach(function(b){b.onclick=function(){openPdf(b.getAttribute("data-emis-open-pdf"));};});
    root.querySelectorAll("[data-emis-review-plan],[data-emis-review-note]").forEach(function(b){b.onclick=function(){
      var id=b.getAttribute("data-emis-review-plan")||b.getAttribute("data-emis-review-note"),status=b.getAttribute("data-status");
      var isNote=b.hasAttribute("data-emis-review-note"), comment=root.querySelector('[data-'+(isNote?'note':'plan')+'-comment="'+id+'"]');
      var text=comment?comment.value.trim():"";
      if(status==="revision_requested"&&!text){window.alert("Please add feedback before requesting a revision.");return;}
      b.disabled=true;
      var q=client.from(isNote?"lesson_notes":"lesson_plans").update({status:status,review_comment:text||null,reviewed_by:null,reviewed_at:new Date().toISOString()}).eq("id",id);
      q.then(function(r){if(r.error)throw r.error;dashboard.refresh();}).catch(function(e){window.alert(e.message||"Review failed.");b.disabled=false;});
    };});
  };
})();