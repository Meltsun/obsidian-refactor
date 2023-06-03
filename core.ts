import {MarkdownView,Notice,TFile,TFolder,Vault,Workspace,MetadataCache} from "obsidian";
import {MarkdownRefactoringHandle,HeadingDepth,is_valid_windows_fileName} from "MarkdownRefactoringHandle"
import escapeStringRegexp from 'escape-string-regexp';
export type { HeadingDepth };

//设置项
export interface MySettings{
    testSetting1:string;
    listIndexHandleMethod:string;
    addHeadingIndexFrom:HeadingDepth|7;
}

const MY_DEFAULT_SETTING: MySettings = {
    testSetting1: 'test default setting',
    listIndexHandleMethod:'Increase from 1' as 'Increase from 1'|'Increase from Any',
    addHeadingIndexFrom:1
}

export class CoreHandle{
    private settings:MySettings
    
    constructor(private vault:Vault,private workspace:Workspace,private metaCache:MetadataCache){}

    public set_settings(newSettings:Partial<MySettings>){
        this.settings=Object.assign({},MY_DEFAULT_SETTING,this.settings,newSettings)
    }

    public get_settings(){
        return this.settings
    }

    //将一个笔记的序号格式化
    public format_index_for_a_note(markdownView:MarkdownView){
        const editor = markdownView.editor;
        const cursor = editor.getCursor();
        let text = editor.getValue();
        const handle=new MarkdownRefactoringHandle(text)
        text = handle
                .format_index({
                    addHeadingIndexFrom:this.settings.addHeadingIndexFrom,
                    listIndexHandleMethod:this.settings.listIndexHandleMethod
                })
                .stringify()
        //format_index(lines,{addTitleIndexFrom:settings.titleIndex, listIndexHandleMethod:settings.listIndex});
        editor.setValue(text);
        editor.setCursor(cursor);
        new Notice("reflactor:序号格式化")
    }

    public heading_to_list(markdownView:MarkdownView,line:number,modifyPeerHeadings:boolean){
        const editor = markdownView.editor;
        const cursor = editor.getCursor();
        let text = editor.getValue();
        const handle=new MarkdownRefactoringHandle(text)
        text = handle
                .heading_to_list_by_line(line+1,modifyPeerHeadings)
                .format_index({
                    addHeadingIndexFrom:this.settings.addHeadingIndexFrom,
                    listIndexHandleMethod:this.settings.listIndexHandleMethod
                })
                .stringify()
        editor.setValue(text);
        editor.setCursor(cursor);
        new Notice("reflactor:标题转列表")
    }

    public list_to_heading(markdownView:MarkdownView,line:number){
        const editor = markdownView.editor;
        const cursor = editor.getCursor();
        let text = editor.getValue();
        const handle=new MarkdownRefactoringHandle(text)
        text = handle
                .list_to_heading_by_line(line+1)
                .format_index({
                    addHeadingIndexFrom:this.settings.addHeadingIndexFrom,
                    listIndexHandleMethod:this.settings.listIndexHandleMethod
                })
                .stringify()
        editor.setValue(text);
        editor.setCursor(cursor);
        new Notice("reflactor:列表转标题")
    }

    public heading_to_heading(markdownView:MarkdownView,line:number,newDepth:HeadingDepth,modifyPeerHeadings:boolean){
        const editor = markdownView.editor;
        const cursor = editor.getCursor();
        let text = editor.getValue();
        const handle=new MarkdownRefactoringHandle(text)
        text = handle
                .heading_to_heading_by_line(line+1,newDepth,modifyPeerHeadings)
                .format_index({
                    addHeadingIndexFrom:this.settings.addHeadingIndexFrom,
                    listIndexHandleMethod:this.settings.listIndexHandleMethod
                })
                .stringify()
        editor.setValue(text);
        editor.setCursor(cursor);
        new Notice("reflactor:列表转标题")
    }

    public async ensure_a_note(parentFolderAbFile:TFolder,name:string):Promise<TFile>{
        name=name+'.md'
        const folderPath=parentFolderAbFile.path
        let notePath = (parentFolderAbFile.isRoot()?'':folderPath+'/')+name;
        let noteFile = this.vault.getAbstractFileByPath(notePath);
        if(!(noteFile instanceof TFile)){
            if(!is_valid_windows_fileName(name+'.md')){
                let illegalIndex=-1;
                do{
                    illegalIndex++;
                    notePath = folderPath+'/'+"原文件标题不合法_"+illegalIndex+'.md'
                }while(this.vault.getAbstractFileByPath(notePath) instanceof TFile)
            }
            noteFile=await this.vault.create(notePath,'');
        }
        return noteFile as TFile
    }

    public async ensure_a_folder(parentFolderAbFile:TFolder,name:string):Promise<TFolder>{
        let folderPath = (parentFolderAbFile.isRoot()?'':parentFolderAbFile.path+'/')+name
        let folderAbFile = this.vault.getAbstractFileByPath(folderPath);
        if(!(folderAbFile instanceof TFolder)){
            if(!is_valid_windows_fileName(name)){
                let illegalIndex=0;
                do{
                    folderPath = parentFolderAbFile+'/'+"原文件夹标题不合法_"+illegalIndex
                    illegalIndex++;
                }while(this.vault.getAbstractFileByPath(folderPath) instanceof TFile)
            }
            await this.vault.createFolder(folderPath);
            folderAbFile=this.vault.getAbstractFileByPath(folderPath)
        }
        return folderAbFile as TFolder
    }

    public async ensure_folder_note(folder:TFolder){
        return this.ensure_a_note(folder,folder.name)
    }

    public async ensure_note_end(note:TFile,end:string){
        const oldContent = await this.vault.read(note);
        if(!new RegExp(`${escapeStringRegexp(end)}\\s*$`).test(oldContent)){
            if(!/\n\n---+\s*$|^\s*$/.test(oldContent)){
                end='\n\n---\n'+end
            }
            await this.vault.modify(note, oldContent+end);
        }
    }

    public async heading_to_note(markdownView:MarkdownView,line:number,modifyPeerHeadings:boolean){
        const selectedNote = markdownView.file;
        if(selectedNote.parent == null){
            return;
        }
        const editor = markdownView.editor;
        const handle=new MarkdownRefactoringHandle(editor.getValue());
        if(modifyPeerHeadings){
            const notes=handle.get_contents_of_peer_heading_by_line(line+1);
            const folder = await this.ensure_a_folder(selectedNote.parent,markdownView.file.name.slice(0,-3))
            for(const noteInfo of notes){
                const newNote = await this.ensure_a_note(folder,noteInfo.headingText)
                await this.ensure_note_end(newNote,noteInfo.content)
            }
        }
        else{
            const noteInfo=handle.get_content_of_a_heading_by_line(line+1);
            const newNote=await this.ensure_a_note(selectedNote.parent,noteInfo.headingText)
            await this.ensure_note_end(newNote,noteInfo.content)
        }
    }

    public folder_to_note(){
        //TODO:
    }

    public add_filetree_link_by_folder(folder:TFolder){
        //TODO:
        for(const file of folder.children){
            if(file instanceof TFolder){
                this.add_filetree_link_by_folder(file)
            }
            else{
                this.metaCache.fileToLinktext(file as TFile,'')
            }
        }
    }



}