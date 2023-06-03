import {Root,Heading,List,Text,Content,ListItem,Paragraph,} from 'mdast';
import {fromMarkdown} from 'mdast-util-from-markdown'
import { toMarkdown} from 'mdast-util-to-markdown';
import { Node } from 'unist';
import {listItemHandle} from './js_src/my-listitem-handle.js'


export type HeadingDepth = 1 | 2 | 3 | 4 | 5 | 6;

function isHeadingDepth(depth: number): depth is HeadingDepth{
    return depth>=1 && depth<=6;
}

function isParagraph(node: Content): node is Paragraph{
    return node?.type === 'paragraph';
}

function isHeading(node: Content ):node is Heading{
    return node?.type === 'heading';
}

function isList(node: Node): node is List{
    return node?.type === 'list';
}

function isText( node: Content ): node is Text{
    return node?.type === 'text';
}

function get_heading_text(heading:Heading,isDeleteIndex=true){
    for(const textNodeOfHeading of heading.children){
        if(isText(textNodeOfHeading)){
        if(isDeleteIndex){
                return textNodeOfHeading.value.replace(/([0-9]+\.)* */,'');
            }
            else{
                return textNodeOfHeading.value
            }
        }
    }
    return ''
}

export function is_valid_windows_fileName(fileName: string): boolean {
    // eslint-disable-next-line no-control-regex
    const regex = /^[^<>:"/\\|?*\x00-\x1F]*[^<>:"/\\|?*\x00-\x1F\s.]$/;
    return regex.test(fileName);
}

//通过这个句柄处理markdown,最后通过stringify()转回字符串
export class MarkdownRefactoringHandle{
    allNodes:Content[];
    root:Root;
    constructor(markdownText:string){
        this.root = fromMarkdown(markdownText)
        this.allNodes = this.root.children;
    }

    //输入一个行数，如果这行是标题则更改其等级，递归的修改其中的标题等级
    public heading_to_heading_by_line(line: number,newDepth:HeadingDepth,modifyPeerHeadings=false ):this{
        for(let i=0;i<this.allNodes.length;i++){
            const node=this.allNodes[i]
            if(!isHeading(node) || !(node.position?.start.line === line)){
                continue;
            }
            let firstHeadingIndex=i;
            for(let j=i;modifyPeerHeadings&&j>=0;j--){
                const lastNode = this.allNodes[j];
                if(isHeading(lastNode)){
                    if(lastNode.depth===node.depth){
                        firstHeadingIndex=j;
                    }
                    else if(lastNode.depth<node.depth){
                        break;
                    }
                }
            }
            const selectedHeading=this.allNodes[firstHeadingIndex] as Heading;
            const oldDepth=selectedHeading.depth
            selectedHeading.depth=newDepth;
            for(let i=firstHeadingIndex+1;i<this.allNodes.length;i++){
                const heading = this.allNodes[i];
                if(!isHeading(heading)){
                    continue;
                }
                if(modifyPeerHeadings?heading.depth>=oldDepth:heading.depth>oldDepth){
                    //heading.depth=this.limitHeadingDepth(heading.depth+newDepth-oldDepth);
                    const anotherHeadingNewDepth = heading.depth+newDepth-oldDepth;
                    if(isHeadingDepth(anotherHeadingNewDepth)){
                        heading.depth=anotherHeadingNewDepth;
                    }
                    else if(anotherHeadingNewDepth>6){
                        this.heading_to_list(i,true,true);
                    }
                }
                else{
                    break;
                }
            }
            break;
        }
        return this;
    }

    public heading_to_list_by_line(line: number, modifyPeerHeadings=false ):this{
        for(let i=0;i<this.allNodes.length;i++){
            const node=this.allNodes[i]
            if(isHeading(node) && node.position?.start.line === line){
                this.heading_to_list(i,modifyPeerHeadings)
                break;
            }
        }
        return this;
    }

    private heading_to_list(headingIndex:number,modifyPeerHeadings:boolean,onlyModifyBelowPeerHeadings=false){
        new heading_to_list_recursive_handle(headingIndex,this.allNodes,modifyPeerHeadings,onlyModifyBelowPeerHeadings)
    }

    //返回最低和最高等级结点
    public get_min_max_heading_depth():{min:HeadingDepth,minNode:Heading,max:HeadingDepth,maxNode:Heading}|undefined{
        let min=undefined;
        let minNode=undefined;
        let max=undefined;
        let maxNode=undefined;
        for(const node of this.allNodes){
            if(isHeading(node)){
                if(min===undefined || node.depth<min){
                    min=node.depth;
                    minNode=node;
                }
                if(max===undefined || node.depth>max){
                    max=node.depth;
                    maxNode=node;
                }
            }
        }
        if(min===undefined || max===undefined || minNode===undefined || maxNode===undefined){
            return undefined;
        }
        else{
            return {min,minNode,max,maxNode}
        }
    }

    //返回当前行的状态和所属的根的子节点
    public check_state_by_line(line:number){
        const headingIndexHandle = new HeadingIndexHandle(undefined,this.get_min_max_heading_depth()?.min);
        const listIndexHandle = new ListIndexHandle('Disabled');
        for(let i=0;i<this.allNodes.length;i++){
            const node=this.allNodes[i];
            if(isHeading(node)){
                headingIndexHandle.update(node);
            }
            let listState={
                listIndex:[0,0,0,0,0,0],
                listDepth:0
            };
            if(node.position?.start.line!=undefined && (line>=node.position?.start.line && line<=node.position?.end.line)){
                if(isList(node)){
                    listState=listIndexHandle.get_list_state_by_line(node,line);
                }
                return{
                    headingIndex:headingIndexHandle.headingIndex,
                    headingDepth:headingIndexHandle.headingDepth,
                    listIndex:listState.listIndex,
                    listDepth:listState.listDepth,
                    node:node,
                    nodeIndex:i
                }
            }
        }
    }

    public list_to_heading_by_line(line:number){
        const state=this.check_state_by_line(line);
        if(state==undefined|| !isList(state.node)){
            return this;
        }
        let flatteningCount=state.listDepth;
        if(state.headingDepth+flatteningCount>6){
            flatteningCount=6-state.headingDepth;
        }
        this.allNodes.splice(state.nodeIndex,1,...new list_to_headin_handle(state.headingDepth+1,flatteningCount,state.node).Contents)
        return this;
    }

    public format_index(options:{
                            addHeadingIndexFrom?:HeadingDepth|7;
                            listIndexHandleMethod?:string;
                        }={}){
        const {
            addHeadingIndexFrom: addHeadingIndexFrom = 7,//为#数量大于等于此值的标题添加序号
            listIndexHandleMethod = 'Disabled'//列表序号的修改方法，直接使用设置里相应选项的字符串
        }=options;
        
        const headingIndexHandle = new HeadingIndexHandle(addHeadingIndexFrom,this.get_min_max_heading_depth()?.min);
        const listIndexHandle = new ListIndexHandle(listIndexHandleMethod);

        for(const node of this.allNodes){
            if(isHeading(node)){
                headingIndexHandle.update(node);
            }
            else if(isList(node)){
                if(node.ordered){
                    listIndexHandle.update(node);
                }
            }
            else{ /* empty */ }
        }
        return this
    }

    public stringify(root=this.root):string{
        //const join:Join = function(left,right,parents,state){
        //    return undefined;// TODO:
        //}

        const handlers={
            listItem:listItemHandle
        }

        return toMarkdown(root,{bullet:'-',listItemIndent:'tab',handlers:handlers})
    }

    public get_content_of_a_heading_by_line(line:number){
        const seletedState=this.check_state_by_line(line);
        if(seletedState===undefined){
            return {headingText:'',content:''} as HeadingTextWithContent;
        }
        const seletedDepth=seletedState.headingDepth
        if(!isHeading(seletedState.node)){
            return {headingText:'',content:''} as HeadingTextWithContent;
        }
        const newRoot={
            type:"root",
            children:[]
        } as Root
        for(let i=seletedState.nodeIndex+1;i<this.allNodes.length;i++){
            const thisNode=this.allNodes[i]
            if(isHeading(thisNode)){
                if(thisNode.depth<=seletedState.headingDepth){
                    break;
                }
                thisNode.depth-=seletedDepth;
            }
            newRoot.children.push(thisNode);
        }
        return {
            headingText:get_heading_text(seletedState.node,false),
            content:this.stringify(newRoot)
        } as HeadingTextWithContent
    }

    public get_contents_of_peer_heading_by_line(line:number){
        const seletedState=this.check_state_by_line(line);
        if(seletedState===undefined){
            return [{headingText:'',content:''}] as HeadingTextWithContent[];
        }
        const seletedDepth=seletedState.headingDepth
        if(!isHeading(seletedState.node)){
            return [{headingText:'',content:''}] as HeadingTextWithContent[];
        }
        let firstHeadingIndex=seletedState.nodeIndex;
        for(let j=firstHeadingIndex;j>=0;j--){
            const lastNode = this.allNodes[j];
            if(isHeading(lastNode)){
                if(lastNode.depth===seletedDepth){
                    firstHeadingIndex=j;
                }
                else if(lastNode.depth<seletedDepth){
                    break;
                }
            }
        }
        const allNewTemps=[];
        let thisRoot;
        for(let i=firstHeadingIndex;i<this.allNodes.length;i++){
            const thisNode=this.allNodes[i]
            if(isHeading(thisNode)){
                if(thisNode.depth<seletedDepth){
                    break;
                }
                if(thisNode.depth===seletedDepth){
                    if(thisRoot!==undefined){
                        allNewTemps.push(thisRoot)
                    }
                    thisRoot={
                        headingtext:get_heading_text(thisNode,false),
                        root:{
                            type:"root",
                            children:[]
                        } as Root
                    }
                    continue;
                }
                else{
                    thisNode.depth-=seletedState.node.depth;
                }
            }
            if(thisRoot!=undefined){
                thisRoot.root.children.push(thisNode);
            }
        }
        if(thisRoot!==undefined){
            allNewTemps.push(thisRoot)
        }
        const allAns=[] as HeadingTextWithContent[]
        for(const temp of allNewTemps){
            allAns.push({
                headingText:temp.headingtext,
                content:this.stringify(temp.root)
            })
        }
        return allAns;
    }
}

interface HeadingTextWithContent{
    headingText:string;
    content:string;
}
class HeadingIndexHandle{
    public headingIndex=[0, 0, 0, 0, 0, 0, 0] as unknown as HeadingDepth[];
    headingDepth=0;
    //undefined表示不改变标题
    constructor(private addHeadingIndexFrom:HeadingDepth|7|undefined=undefined,private minHeadingDepth:HeadingDepth|undefined=undefined){
    }
    public update(headingNode:Heading){
        this.headingDepth=headingNode.depth;
        for(let j=1;j<headingNode.depth;j++){
            if(this.headingIndex[j]<1){
                this.headingIndex[j]=1;
            }
        }
        this.headingIndex[headingNode.depth]++;
        for(let j=headingNode.depth+1;j<this.headingIndex.length;j++){
            this.headingIndex[j]=0 as HeadingDepth; 
        }
        if(this.addHeadingIndexFrom!=undefined){
            for(const childNode of headingNode.children){
                if(!isText(childNode)){
                    continue;
                }
                let indexText='';
                let start;
                if(this.minHeadingDepth!=undefined && this.minHeadingDepth>this.addHeadingIndexFrom){
                    start=this.minHeadingDepth;
                }
                else{
                    start=this.addHeadingIndexFrom;
                }
                for(let j=start;j<=headingNode.depth;j++){
                    indexText=indexText+this.headingIndex[j]+'.';
                }
                if(indexText!==''){
                    indexText+=' '
                }
                childNode.value=childNode.value.replace(/([0-9]+\.)* */,indexText);
                break;
            }
        }
    }
}

class ListIndexHandle{
    listIndex=[0, 0, 0, 0, 0, 0, 0];
    listDepth=0;
    constructor(private listIndexHandleMethod:string){}
    public update(listNode:List){
        if(this.listIndexHandleMethod==='Increase from 1'){
            listNode.start=1;
        }
    }
    public get_list_state_by_line(listNode:List,line:number){
        this.get_list_state_by_line_recrusively(listNode,line);
        return {
            listIndex:this.listIndex,
            listDepth:this.listDepth
        };
    }

    get_list_state_by_line_recrusively(listNode:List,line:number){
        this.listDepth++;
        for(const item of listNode.children){
            this.listIndex[this.listDepth]++;
            for(let i=this.listDepth+1;i<this.listIndex.length;i++){
                this.listIndex[i]=0 as HeadingDepth;
            }
            for(const chileNode of item.children){
                if(isList(chileNode) 
                    && chileNode.position?.start.line!=undefined 
                    && line>=chileNode.position?.start.line 
                    && line<=chileNode.position?.end.line){
                    
                        this.get_list_state_by_line_recrusively(chileNode,line);
                }
            }
        }
    }

}

class heading_to_list_recursive_handle{
    tail:Content[]=[];
    deleteCount=0;
    newlist={
        type: 'list',
        ordered: true,
        start: 1,
        spread: false,
        children: []
    } as List
    constructor(headingIndex:number,private allNodes:Content[],modifyPeerHeadings=false,onlyModifyBelowPeerHeadings=false){
        const selectedHeading=this.allNodes[headingIndex] as Heading;
        let firstHeadingIndex=headingIndex;
        if(modifyPeerHeadings){
            for(let j=headingIndex-1;!(onlyModifyBelowPeerHeadings) && j>=0;j--){
                const node = this.allNodes[j];
                if(isHeading(node)){
                    if(node.depth===selectedHeading.depth){
                        firstHeadingIndex=j;
                    }
                    else if(node.depth<selectedHeading.depth){
                        break;
                    }
                }
            }
            for(let j=firstHeadingIndex;j<this.allNodes.length;j++){
                const node = this.allNodes[j];
                if(isHeading(node)){
                    if(node.depth===selectedHeading.depth){
                        this.heading_to_list_recursive(j,this.newlist.children);
                    }
                    else if(node.depth<selectedHeading.depth){
                        break;
                    }
                }
            }
        }
        else{
            this.heading_to_list_recursive(headingIndex,this.newlist.children);
        }
        allNodes.splice(firstHeadingIndex,this.deleteCount,this.newlist,...this.tail)
    }

    heading_to_list_recursive(index:number,parent:ListItem[]):number{
        const lastHeading = this.allNodes[index] as Heading;
        const headingText =  get_heading_text(lastHeading);
        const newList={
                type: 'list',
                ordered: true,
                start: 1,
                spread: false,
                children: [] as ListItem[]
            } as List;
        parent.push({
            type: 'listItem',
            spread: false,
            children: [
                {
                    type: 'paragraph',
                    children: [
                        {
                            type:'text',
                            value: headingText,
                        } as Text
                    ]
                } as Paragraph,
                newList
            ]}as ListItem);
        parent=newList.children;
        this.deleteCount++;
        index++;
        let listIndex = 1;
        for(;index<this.allNodes.length;index++){
            const thisNode = this.allNodes[index];
            if(isHeading(thisNode)){
                if(thisNode.depth>lastHeading.depth){
                    index=this.heading_to_list_recursive(index,parent);
                }
                else{
                    break;
                }
            }
            else if(isParagraph(thisNode)){
                parent.push(
                    {
                        type: 'listItem',
                        spread: false,
                        children: [thisNode]
                    } as ListItem
                )
                this.deleteCount++;
            }
            else if(isList(thisNode)){
                parent.push({
                    type: 'listItem',
                    spread: false,
                    children: [
                        {
                            type: 'paragraph',
                            children: [
                                {
                                    type:'text',
                                    value: headingText+`-list${listIndex}`,
                                } as Text
                            ]
                        } as Paragraph,
                        thisNode
                    ]}as ListItem);
                this.deleteCount++;
                listIndex++;
            }
            else{
                this.tail.push(thisNode)
                this.deleteCount++;
            }
        }
        return index-1;
    }
}

class list_to_headin_handle{
    public Contents:Content[];
    constructor(private headingDepthStart:number,private flatteningCount:number,listNode:List){
        this.Contents=[listNode]
        for(let i=0; i<flatteningCount; i++){
            this.list_to_heading((headingDepthStart+i) as HeadingDepth)
        }
    }
    list_to_heading(depth:HeadingDepth){
        const newContents=[] as Content[];
        for(const node of this.Contents){
            if(isList(node)){
                for(const item of node.children){
                    const childNewContents=[] as Content[];
                    const isHeadingTextGot=false;
                    for(const child of item.children){
                        if(isParagraph(child) && !isHeadingTextGot){
                            childNewContents.unshift(
                                {
                                    type: 'heading',
                                    depth: depth,
                                    children: child.children,
                                }as Heading
                            )
                        }
                        else{
                            childNewContents.push(child);
                        }
                    }
                    newContents.push(...childNewContents)
                }
            }
            else{
                newContents.push(node)
            }
        }
        this.Contents=newContents;
    }
}