"use strict";(self.webpackChunk_siteglide_gui=self.webpackChunk_siteglide_gui||[]).push([[536],{2536:(e,n,t)=>{t.r(n),t.d(n,{c:()=>f});var i,l=t(1829);function r(e,n,t){return n in e?Object.defineProperty(e,n,{value:t,enumerable:!0,configurable:!0,writable:!0}):e[n]=t,e}var o=Object.defineProperty,a=function(e,n){return o(e,"name",{value:n,configurable:!0})};function c(e,n){return n.forEach((function(n){n&&"string"!=typeof n&&!Array.isArray(n)&&Object.keys(n).forEach((function(t){if("default"!==t&&!(t in e)){var i=Object.getOwnPropertyDescriptor(n,t);Object.defineProperty(e,t,i.get?i:{enumerable:!0,get:function(){return n[t]}})}}))})),Object.freeze(e)}a(c,"_mergeNamespaces");var m={exports:{}};!function(e){var n={},t=/[^\s\u00a0]/,i=e.Pos,l=e.cmpPos;function r(e){var n=e.search(t);return-1==n?0:n}function o(e,n,t){return/\bstring\b/.test(e.getTokenTypeAt(i(n.line,0)))&&!/^[\'\"\`]/.test(t)}function c(e,n){var t=e.getMode();return!1!==t.useInnerComments&&t.innerMode?e.getModeAt(n):t}a(r,"firstNonWS"),e.commands.toggleComment=function(e){e.toggleComment()},e.defineExtension("toggleComment",(function(e){e||(e=n);for(var t=this,l=1/0,r=this.listSelections(),o=null,a=r.length-1;a>=0;a--){var c=r[a].from(),m=r[a].to();c.line>=l||(m.line>=l&&(m=i(l,0)),l=c.line,null==o?t.uncomment(c,m,e)?o="un":(t.lineComment(c,m,e),o="line"):"un"==o?t.uncomment(c,m,e):t.lineComment(c,m,e))}})),a(o,"probablyInsideString"),a(c,"getMode"),e.defineExtension("lineComment",(function(e,l,a){a||(a=n);var m=this,g=c(m,e),f=m.getLine(e.line);if(null!=f&&!o(m,e,f)){var s=a.lineComment||g.lineComment;if(s){var u=Math.min(0!=l.ch||l.line==e.line?l.line+1:l.line,m.lastLine()+1),d=null==a.padding?" ":a.padding,h=a.commentBlankLines||e.line==l.line;m.operation((function(){if(a.indent){for(var n=null,l=e.line;l<u;++l){var o=(c=m.getLine(l)).slice(0,r(c));(null==n||n.length>o.length)&&(n=o)}for(l=e.line;l<u;++l){var c=m.getLine(l),g=n.length;(h||t.test(c))&&(c.slice(0,g)!=n&&(g=r(c)),m.replaceRange(n+s+d,i(l,0),i(l,g)))}}else for(l=e.line;l<u;++l)(h||t.test(m.getLine(l)))&&m.replaceRange(s+d,i(l,0))}))}else(a.blockCommentStart||g.blockCommentStart)&&(a.fullLines=!0,m.blockComment(e,l,a))}})),e.defineExtension("blockComment",(function(e,r,o){o||(o=n);var a=this,m=c(a,e),g=o.blockCommentStart||m.blockCommentStart,f=o.blockCommentEnd||m.blockCommentEnd;if(g&&f){if(!/\bcomment\b/.test(a.getTokenTypeAt(i(e.line,0)))){var s=Math.min(r.line,a.lastLine());s!=e.line&&0==r.ch&&t.test(a.getLine(s))&&--s;var u=null==o.padding?" ":o.padding;e.line>s||a.operation((function(){if(0!=o.fullLines){var n=t.test(a.getLine(s));a.replaceRange(u+f,i(s)),a.replaceRange(g+u,i(e.line,0));var c=o.blockCommentLead||m.blockCommentLead;if(null!=c)for(var d=e.line+1;d<=s;++d)(d!=s||n)&&a.replaceRange(c+u,i(d,0))}else{var h=0==l(a.getCursor("to"),r),p=!a.somethingSelected();a.replaceRange(f,r),h&&a.setSelection(p?r:a.getCursor("from"),r),a.replaceRange(g,e)}}))}}else(o.lineComment||m.lineComment)&&0!=o.fullLines&&a.lineComment(e,r,o)})),e.defineExtension("uncomment",(function(e,l,r){r||(r=n);var o,a=this,m=c(a,e),g=Math.min(0!=l.ch||l.line==e.line?l.line:l.line-1,a.lastLine()),f=Math.min(e.line,g),s=r.lineComment||m.lineComment,u=[],d=null==r.padding?" ":r.padding;e:if(s){for(var h=f;h<=g;++h){var p=a.getLine(h),b=p.indexOf(s);if(b>-1&&!/comment/.test(a.getTokenTypeAt(i(h,b+1)))&&(b=-1),-1==b&&t.test(p))break e;if(b>-1&&t.test(p.slice(0,b)))break e;u.push(p)}if(a.operation((function(){for(var e=f;e<=g;++e){var n=u[e-f],t=n.indexOf(s),l=t+s.length;t<0||(n.slice(l,l+d.length)==d&&(l+=d.length),o=!0,a.replaceRange("",i(e,t),i(e,l)))}})),o)return!0}var v=r.blockCommentStart||m.blockCommentStart,C=r.blockCommentEnd||m.blockCommentEnd;if(!v||!C)return!1;var k=r.blockCommentLead||m.blockCommentLead,L=a.getLine(f),x=L.indexOf(v);if(-1==x)return!1;var O=g==f?L:a.getLine(g),y=O.indexOf(C,g==f?x+v.length:0),S=i(f,x+1),R=i(g,y+1);if(-1==y||!/comment/.test(a.getTokenTypeAt(S))||!/comment/.test(a.getTokenTypeAt(R))||a.getRange(S,R,"\n").indexOf(C)>-1)return!1;var T=L.lastIndexOf(v,e.ch),E=-1==T?-1:L.slice(0,e.ch).indexOf(C,T+v.length);if(-1!=T&&-1!=E&&E+C.length!=e.ch)return!1;E=O.indexOf(C,l.ch);var M=O.slice(l.ch).lastIndexOf(v,E-l.ch);return T=-1==E||-1==M?-1:l.ch+M,(-1==E||-1==T||T==l.ch)&&(a.operation((function(){a.replaceRange("",i(g,y-(d&&O.slice(y-d.length,y)==d?d.length:0)),i(g,y+C.length));var e=x+v.length;if(d&&L.slice(e,e+d.length)==d&&(e+=d.length),a.replaceRange("",i(f,x),i(f,e)),k)for(var n=f+1;n<=g;++n){var l=a.getLine(n),r=l.indexOf(k);if(-1!=r&&!t.test(l.slice(0,r))){var o=r+k.length;d&&l.slice(o,o+d.length)==d&&(o+=d.length),a.replaceRange("",i(n,r),i(n,o))}}})),!0)}))}(l.a.exports);var g=m.exports,f=Object.freeze(c((r(i={__proto__:null},Symbol.toStringTag,"Module"),r(i,"default",g),i),[m.exports]))}}]);