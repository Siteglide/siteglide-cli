"use strict";(self.webpackChunk_siteglide_gui=self.webpackChunk_siteglide_gui||[]).push([[128,190],{7125:(e,t,n)=>{n.d(t,{a:()=>f,b:()=>p,c:()=>m,d:()=>s,e:()=>v,g:()=>l});var i=n(275),r=n(8935),o=n(7976),a=Object.defineProperty,u=function(e,t){return a(e,"name",{value:t,configurable:!0})};function l(e,t){var n={schema:e,type:null,parentType:null,inputType:null,directiveDef:null,fieldDef:null,argDef:null,argDefs:null,objectFieldDefs:null};return(0,o.f)(t,(function(t){var r,o;switch(t.kind){case"Query":case"ShortQuery":n.type=e.getQueryType();break;case"Mutation":n.type=e.getMutationType();break;case"Subscription":n.type=e.getSubscriptionType();break;case"InlineFragment":case"FragmentDefinition":t.type&&(n.type=e.getType(t.type));break;case"Field":case"AliasedField":n.fieldDef=n.type&&t.name?d(e,n.parentType,t.name):null,n.type=null===(r=n.fieldDef)||void 0===r?void 0:r.type;break;case"SelectionSet":n.parentType=n.type?(0,i.xC)(n.type):null;break;case"Directive":n.directiveDef=t.name?e.getDirective(t.name):null;break;case"Arguments":var a=t.prevState?"Field"===t.prevState.kind?n.fieldDef:"Directive"===t.prevState.kind?n.directiveDef:"AliasedField"===t.prevState.kind?t.prevState.name&&d(e,n.parentType,t.prevState.name):null:null;n.argDefs=a?a.args:null;break;case"Argument":if(n.argDef=null,n.argDefs)for(var u=0;u<n.argDefs.length;u++)if(n.argDefs[u].name===t.name){n.argDef=n.argDefs[u];break}n.inputType=null===(o=n.argDef)||void 0===o?void 0:o.type;break;case"EnumValue":var l=n.inputType?(0,i.xC)(n.inputType):null;n.enumValue=l instanceof i.mR?c(l.getValues(),(function(e){return e.value===t.name})):null;break;case"ListValue":var f=n.inputType?(0,i.tf)(n.inputType):null;n.inputType=f instanceof i.p2?f.ofType:null;break;case"ObjectValue":var p=n.inputType?(0,i.xC)(n.inputType):null;n.objectFieldDefs=p instanceof i.sR?p.getFields():null;break;case"ObjectField":var m=t.name&&n.objectFieldDefs?n.objectFieldDefs[t.name]:null;n.inputType=null==m?void 0:m.type;break;case"NamedType":n.type=t.name?e.getType(t.name):null}})),n}function d(e,t,n){return n===r.S.name&&e.getQueryType()===t?r.S:n===r.T.name&&e.getQueryType()===t?r.T:n===r.a.name&&(0,i.Gv)(t)?r.a:t&&t.getFields?t.getFields()[n]:void 0}function c(e,t){for(var n=0;n<e.length;n++)if(t(e[n]))return e[n]}function f(e){return{kind:"Field",schema:e.schema,field:e.fieldDef,type:g(e.fieldDef)?null:e.parentType}}function p(e){return{kind:"Directive",schema:e.schema,directive:e.directiveDef}}function m(e){return e.directiveDef?{kind:"Argument",schema:e.schema,argument:e.argDef,directive:e.directiveDef}:{kind:"Argument",schema:e.schema,argument:e.argDef,field:e.fieldDef,type:g(e.fieldDef)?null:e.parentType}}function s(e){return{kind:"EnumValue",value:e.enumValue||void 0,type:e.inputType?(0,i.xC)(e.inputType):void 0}}function v(e,t){return{kind:"Type",schema:e.schema,type:t||e.type}}function g(e){return"__"===e.name.slice(0,2)}u(l,"getTypeInfo"),u(d,"getFieldDef"),u(c,"find"),u(f,"getFieldReference"),u(p,"getDirectiveReference"),u(m,"getArgumentReference"),u(s,"getEnumValueReference"),u(v,"getTypeReference"),u(g,"isMetaField")},7976:(e,t,n)=>{function i(e,t){for(var n=[],i=e;null==i?void 0:i.kind;)n.push(i),i=i.prevState;for(var r=n.length-1;r>=0;r--)t(n[r])}n.d(t,{f:()=>i}),(0,Object.defineProperty)(i,"name",{value:"forEachState",configurable:!0})},6190:(e,t,n)=>{n.r(t);var i=n(1829),r=(n(2632),n(362),n(7935),Object.defineProperty),o=function(e,t){return r(e,"name",{value:t,configurable:!0})};function a(e){return{options:e instanceof Function?{render:e}:!0===e?{}:e}}function u(e){var t=e.state.info.options;return(null==t?void 0:t.hoverTime)||500}function l(e,t){var n=e.state.info,r=t.target||t.srcElement;if(r instanceof HTMLElement&&"SPAN"===r.nodeName&&void 0===n.hoverTimeout){var a=r.getBoundingClientRect(),l=o((function(){clearTimeout(n.hoverTimeout),n.hoverTimeout=setTimeout(f,p)}),"onMouseMove"),c=o((function(){i.C.off(document,"mousemove",l),i.C.off(e.getWrapperElement(),"mouseout",c),clearTimeout(n.hoverTimeout),n.hoverTimeout=void 0}),"onMouseOut"),f=o((function(){i.C.off(document,"mousemove",l),i.C.off(e.getWrapperElement(),"mouseout",c),n.hoverTimeout=void 0,d(e,a)}),"onHover"),p=u(e);n.hoverTimeout=setTimeout(f,p),i.C.on(document,"mousemove",l),i.C.on(e.getWrapperElement(),"mouseout",c)}}function d(e,t){var n=e.coordsChar({left:(t.left+t.right)/2,top:(t.top+t.bottom)/2}),i=e.state.info.options,r=i.render||e.getHelper(n,"info");if(r){var o=e.getTokenAt(n,!0);if(o){var a=r(o,i,e,n);a&&c(e,t,a)}}}function c(e,t,n){var r=document.createElement("div");r.className="CodeMirror-info",r.appendChild(n),document.body.appendChild(r);var a=r.getBoundingClientRect(),u=window.getComputedStyle(r),l=a.right-a.left+parseFloat(u.marginLeft)+parseFloat(u.marginRight),d=a.bottom-a.top+parseFloat(u.marginTop)+parseFloat(u.marginBottom),c=t.bottom;d>window.innerHeight-t.bottom-15&&t.top>window.innerHeight-t.bottom&&(c=t.top-d),c<0&&(c=t.bottom);var f,p=Math.max(0,window.innerWidth-l-15);p>t.left&&(p=t.left),r.style.opacity="1",r.style.top=c+"px",r.style.left=p+"px";var m=o((function(){clearTimeout(f)}),"onMouseOverPopup"),s=o((function(){clearTimeout(f),f=setTimeout(v,200)}),"onMouseOut"),v=o((function(){i.C.off(r,"mouseover",m),i.C.off(r,"mouseout",s),i.C.off(e.getWrapperElement(),"mouseout",s),r.style.opacity?(r.style.opacity="0",setTimeout((function(){r.parentNode&&r.parentNode.removeChild(r)}),600)):r.parentNode&&r.parentNode.removeChild(r)}),"hidePopup");i.C.on(r,"mouseover",m),i.C.on(r,"mouseout",s),i.C.on(e.getWrapperElement(),"mouseout",s)}i.C.defineOption("info",!1,(function(e,t,n){if(n&&n!==i.C.Init){var r=e.state.info.onMouseOver;i.C.off(e.getWrapperElement(),"mouseover",r),clearTimeout(e.state.info.hoverTimeout),delete e.state.info}if(t){var o=e.state.info=a(t);o.onMouseOver=l.bind(null,e),i.C.on(e.getWrapperElement(),"mouseover",o.onMouseOver)}})),o(a,"createState"),o(u,"getHoverTime"),o(l,"onMouseOver"),o(d,"onMouseHover"),o(c,"showPopup")},7755:(e,t,n)=>{n.r(t);var i=n(275),r=n(1829),o=n(7125),a=(n(6190),n(2632),n(362),n(7935),n(8935),n(7976),Object.defineProperty),u=function(e,t){return a(e,"name",{value:t,configurable:!0})};function l(e,t,n){d(e,t,n),p(e,t,n,t.type)}function d(e,t,n){var i,r=(null===(i=t.fieldDef)||void 0===i?void 0:i.name)||"";"__"!==r.slice(0,2)&&(s(e,t,n,t.parentType),y(e,".")),y(e,r,"field-name",n,(0,o.a)(t))}function c(e,t,n){var i;y(e,"@"+((null===(i=t.directiveDef)||void 0===i?void 0:i.name)||""),"directive-name",n,(0,o.b)(t))}function f(e,t,n){var i;t.directiveDef?c(e,t,n):t.fieldDef&&d(e,t,n);var r=(null===(i=t.argDef)||void 0===i?void 0:i.name)||"";y(e,"("),y(e,r,"arg-name",n,(0,o.c)(t)),p(e,t,n,t.inputType),y(e,")")}function p(e,t,n,i){y(e,": "),s(e,t,n,i)}function m(e,t,n){var i,r=(null===(i=t.enumValue)||void 0===i?void 0:i.name)||"";s(e,t,n,t.inputType),y(e,"."),y(e,r,"enum-value",n,(0,o.d)(t))}function s(e,t,n,r){r instanceof i.bM?(s(e,t,n,r.ofType),y(e,"!")):r instanceof i.p2?(y(e,"["),s(e,t,n,r.ofType),y(e,"]")):y(e,(null==r?void 0:r.name)||"","type-name",n,(0,o.e)(t,r))}function v(e,t,n){var i=n.description;if(i){var r=document.createElement("div");r.className="info-description",t.renderDescription?r.innerHTML=t.renderDescription(i):r.appendChild(document.createTextNode(i)),e.appendChild(r)}g(e,t,n)}function g(e,t,n){var i=n.deprecationReason;if(i){var r=document.createElement("div");r.className="info-deprecation",t.renderDescription?r.innerHTML=t.renderDescription(i):r.appendChild(document.createTextNode(i));var o=document.createElement("span");o.className="info-deprecation-label",o.appendChild(document.createTextNode("Deprecated: ")),r.insertBefore(o,r.firstChild),e.appendChild(r)}}function y(e,t){var n=arguments.length>2&&void 0!==arguments[2]?arguments[2]:"",i=arguments.length>3&&void 0!==arguments[3]?arguments[3]:{onClick:null},r=arguments.length>4&&void 0!==arguments[4]?arguments[4]:null;if(n){var o,a=i.onClick;a?((o=document.createElement("a")).href="javascript:void 0",o.addEventListener("click",(function(e){a(r,e)}))):o=document.createElement("span"),o.className=n,o.appendChild(document.createTextNode(t)),e.appendChild(o)}else e.appendChild(document.createTextNode(t))}r.C.registerHelper("info","graphql",(function(e,t){if(t.schema&&e.state){var n=e.state,i=n.kind,r=n.step,a=(0,o.g)(t.schema,e.state);if("Field"===i&&0===r&&a.fieldDef||"AliasedField"===i&&2===r&&a.fieldDef){var u=document.createElement("div");return l(u,a,t),v(u,t,a.fieldDef),u}if("Directive"===i&&1===r&&a.directiveDef){var d=document.createElement("div");return c(d,a,t),v(d,t,a.directiveDef),d}if("Argument"===i&&0===r&&a.argDef){var p=document.createElement("div");return f(p,a,t),v(p,t,a.argDef),p}if("EnumValue"===i&&a.enumValue&&a.enumValue.description){var g=document.createElement("div");return m(g,a,t),v(g,t,a.enumValue),g}if("NamedType"===i&&a.type&&a.type.description){var y=document.createElement("div");return s(y,a,t,a.type),v(y,t,a.type),y}}})),u(l,"renderField"),u(d,"renderQualifiedField"),u(c,"renderDirective"),u(f,"renderArg"),u(p,"renderTypeAnnotation"),u(m,"renderEnumValue"),u(s,"renderType"),u(v,"renderDescription"),u(g,"renderDeprecation"),u(y,"text")}}]);