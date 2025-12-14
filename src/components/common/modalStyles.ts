/**
 * 공통 모달 스타일 유틸리티
 * TaskModal 디자인을 기반으로 모든 모달에 일관된 스타일 적용
 */

export const modalStyles = {
  // 배경 오버레이 (어두운 배경 + 블러)
  overlay: 'fixed inset-0 bg-gray-900 bg-opacity-20 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200',
  
  // 모달 컨테이너 (라운드, 그림자, 애니메이션)
  container: 'bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200',
  
  // 헤더 (하늘색 배경)
  header: 'shrink-0 p-6 border-b border-gray-100 bg-blue-50',
  
  // 헤더 내부 레이아웃
  headerContent: 'flex justify-between items-center',
  
  // 헤더 왼쪽 (아이콘 + 제목)
  headerLeft: 'flex items-center gap-3',
  
  // 아이콘 컨테이너 (하늘색 배경, 라운드)
  iconContainer: 'p-2 bg-blue-100 rounded-lg',
  
  // 아이콘 스타일
  icon: 'w-6 h-6 text-blue-600',
  
  // 제목 스타일
  title: 'text-xl font-semibold text-gray-900',
  
  // 닫기 버튼
  closeButton: 'p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors duration-200',
  
  // 닫기 버튼 아이콘
  closeIcon: 'w-5 h-5',
  
  // 본문 (스크롤 가능)
  body: 'flex-1 overflow-y-auto p-6',
  
  // 폼 본문
  formBody: 'flex-1 overflow-y-auto p-6',
} as const;

/**
 * 모달 아이콘 SVG 경로 데이터
 */
export const modalIconPaths = {
  task: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  client: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  instrument: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
  item: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  connection: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  sale: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  close: 'M6 18L18 6M6 6l12 12',
} as const;

/**
 * 모달 헤더 컴포넌트를 위한 타입
 */
export interface ModalHeaderProps {
  title: string;
  icon: keyof typeof modalIconPaths;
  onClose: () => void;
  titleId?: string;
}
