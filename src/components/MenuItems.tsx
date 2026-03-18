import { useDispatch } from "react-redux";
import { setActiveArticle } from "~/store/appSlice";
import { useRouter } from "next/navigation";

export interface MenuItem {
  municipality: string;
  page: string;
  title: string;
}

export interface MenuItemProps {
  targetmunicipality: string;
  targetpage: string;
  title?: string;
  icon?: string;
  onClick?: () => void;
}

export const PrimaryMenuItem = (props: any) => {
  const { push } = useRouter();

  return <div className="
    PrimaryMenuItem
    px-5
  ">
    <a href={props.url} className="flex flex-col justify-center h-full" onClick={(e) => {
      e.preventDefault();

      push(props.url);
    }}>
      {props.icon ? <img src={props.icon} alt={props.title ? `${props.title} - icoon` : 'Menu icoon'} width={30} height={30} style={{ height: '30px', width: 'auto' }} /> : ''}
      {props.title}
    </a>
  </div>
}

export const SecundaryMenuItem = (props: any) => {
  const { push } = useRouter();

  return <div className="
    SecundaryMenuItem
    px-2
  ">
    <a href="#" className="flex flex-col justify-center h-full" onClick={(e) => {
      e.preventDefault();

      push(props.url);
    }}>
      {props.title}
    </a>
  </div>
}

export const PrimaryMenuItem_overlay = ({targetmunicipality, targetpage, title, icon}: MenuItemProps) => {
  const dispatch = useDispatch();

  return <div className={`
    PrimaryMenuItem
    px-5
  `}>
    <a href="" className="flex flex-col justify-center h-full" onClick={(e) => {
      e.preventDefault();

      // console.debug("#### AppHeaderDesktop - PrimaryMenuItem - set active article ", title);
      dispatch(setActiveArticle({municipality: targetmunicipality, articleTitle: targetpage}));
    }}>
      {icon ? <img src={icon} alt={title ? `${title} - icoon` : 'Menu icoon'} width={30} height={30} style={{ height: '30px', width: 'auto' }} /> : ''}
      {title}
    </a>
  </div>
}

export const SecundaryMenuItem_overlay = ({targetmunicipality, targetpage, title, icon}: MenuItemProps) => {
  const dispatch = useDispatch();

  return <div className="
    SecundaryMenuItem
    px-2
  ">
    <a href="#" className="flex flex-col justify-center h-full" onClick={(e) => {
      e.preventDefault();

      dispatch(setActiveArticle({municipality: targetmunicipality, articleTitle: targetpage}));
    }}>
      {title}
    </a>
  </div>
}